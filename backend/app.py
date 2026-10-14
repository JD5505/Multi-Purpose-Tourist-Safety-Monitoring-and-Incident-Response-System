from fastapi import FastAPI, Depends, HTTPException, Request, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import JSONResponse
from db.connection import get_db
from Schema.session_validation import RegisterRequest, VerifyOTPRequest, VerifyLogin, EnterNewPassword
from Schema.location_data import LocationSequence, GeofencePing
from auth.registration import Registrations
from auth.forgot_pass import check_password, send_email, check_otp, enter_data
from auth.login import verify_password
from auth.generate_token import create_access_token
from Operations.calc import preprocess
from Operations.inference import run_inference
from Operations.location_entry import enter_location as db_enter_location
from Operations.clear_entries import remove_entries_db
from Operations.geofence_logging import log_anomaly
from Operations.get_loc_data import get_data, get_preprocessed_tensor
from bc_module.blockchain import log_to_blockchain
from llm.llm_inference import get_response
import config
import numpy as np
import jwt
import time
from fastapi.middleware.cors import CORSMiddleware


oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/login"
)


def get_current_user(
    token: str = Depends(oauth2_scheme)
):

    try:
        payload = jwt.decode(
            token,
            config.JWT_SECRET,
            algorithms = config.JWT_ALGORITHM
        )

        email = payload.get("email")
        role = payload.get("role")

        if email is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid token"
            )

        return {
            "email": email,
            "role": role
        }
    
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token has expired"
        )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    
app = FastAPI(
    title = "Tourist Safety Monitoring System"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def measure_latency(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time_ms = (time.perf_counter() - start_time) * 1000
    response.headers["X-Response-Time-Ms"] = f"{process_time_ms:.2f}"
    print(f"[{request.method}] {request.url.path} - Latency: {process_time_ms:.2f} ms")
    return response

@app.get("/")
def home():
    return {
        "message" : "Hello, welcome to the tourist safety monitoring system api"
    }

@app.get("/health")
def health_check():
    return {
        "server": "Running",
        "version": "0.1.0",
        "Verified": True
    }


@app.post("/registration")
def register_user(data: RegisterRequest, cursor = Depends(get_db)):
    email = data.email
    password = data.password
    role = data.role
    register = Registrations()
    register.clear_registrations(cursor)
    is_registered = register.register_user(email, password, role, cursor)
    if is_registered == True:
        return JSONResponse(status_code = 200, content={"message": "Recieved, please verify email with an otp", "status": True})
    else:
        return JSONResponse(status_code = 500, content={"message": "Error while registering", "status": False})

@app.post("/remove-account")
def account_removal(data: RegisterRequest, cursor = Depends(get_db)):
    register = Registrations()
    is_removed = register.remove_account(data.email, data.password, cursor)
    if is_removed == True:
        return JSONResponse(status_code = 200, content = {'message': "Account Removed Successfully", 'status': True})
    else:
        return JSONResponse(status_code = 500, content = {'message': "Error While Removing", 'status': False})
    
@app.post("/registration/enter_otp")
def verify_otp(data: VerifyOTPRequest, cursor = Depends(get_db)):
    email = data.email
    otp = data.otp
    register = Registrations()
    register.clear_registrations(cursor)
    is_verified = register.verify_registration(email, otp, cursor)
    if is_verified == True:
        return JSONResponse(status_code = 200, content={"status": True})
    else:
        return JSONResponse(status_code = 404, content={"status": False})

@app.post("/login")
def verify_login(data: VerifyLogin, cursor = Depends(get_db)):
    email = data.email
    password = data.password
    is_verified = verify_password(email, password, cursor)
    if is_verified == True:
        cursor.execute("""
        SELECT email, role FROM users
        WHERE email = %s
        """, (email,))
        data = cursor.fetchone()
        token = create_access_token(data)

        return JSONResponse(status_code = 200, content = {'token': token, 'verified': True})

@app.post("/forgot_password")
def get_password(data: VerifyLogin, cursor = Depends(get_db)):
    email = data.email
    password = data.password
    ans = check_password(email, password, cursor)
    if ans == True:
        return JSONResponse(status_code = 200, content={'message': "Your password is correct"})
    else:
        send_email(email, cursor)
        return JSONResponse(status_code = 200, content={"message": "Wrong password, enter otp to create new password"})

@app.post("/forgot_password/enter_otp")
def get_otp(data:VerifyOTPRequest, cursor = Depends(get_db)):
    email = data.email
    otp = data.otp
    if check_otp(email, otp, cursor) == True:
        return JSONResponse(status_code = 200, content={'message': "Enter a new password"})
    else:
        return JSONResponse(status_code = 200, content={'message': "Wrong otp"})

@app.post("/forgot_password/enter_new_password")
def enter_password(data: EnterNewPassword, cursor = Depends(get_db)):
    email = data.email
    password = data.password
    if enter_data(email, password, cursor) == True:
        return JSONResponse(status_code=200, content={'message': "Password Reset Successfully"})
    else:
        return JSONResponse(status_code=200, content={'message': "Unknown Error Occured"})

@app.get("/profile")
def get_profile(current_user = Depends(get_current_user)):
    return JSONResponse(status_code=200, content = {"current_user": current_user})

@app.post("/location_data")
def enter_location(
    data: LocationSequence,
    background_tasks: BackgroundTasks,
    current_user = Depends(get_current_user), 
    cursor = Depends(get_db)
):
    coords_list = []
    times_list = []
    samples_tuples = []

    for s in data.samples:
        coords_list.append([s.latitude, s.longitude])
        times_list.append(s.timestamp.timestamp())
        samples_tuples.append((s.latitude, s.longitude, s.timestamp))

    coords = np.array(coords_list, dtype=np.float64)
    times = np.array(times_list, dtype=np.float64)

    background_tasks.add_task(db_enter_location, current_user['email'], samples_tuples, cursor)
    background_tasks.add_task(remove_entries_db)

    tensors = preprocess(coords, times)
    mse = float(run_inference(tensors))

    is_anomaly = mse >= 0.55
    status = "Anomaly" if is_anomaly else "Normal"

    return {"status": status, "mse": mse}

@app.post("/geofence_ping")
def send_data(data: GeofencePing, 
              cursor = Depends(get_db), 
              current_user = Depends(get_current_user)):
    user_lat = data.lat
    user_long = data.long
    time_of_breach = data.timestamp
    caution_zone_coords = data.caution_zone_coords
    danger_zone_coords = data.danger_zone_coords
    email = current_user['email']
    tx_hash = log_to_blockchain(
        email, user_lat, user_long, time_of_breach
        )
    loc_data = get_data(email, cursor)

    tensor_data = get_preprocessed_tensor(loc_data)
    if tensor_data is not None:
        model_output = run_inference(tensor_data)
    else:
        model_output = None

    llm_eval = get_response(model_output, 
                            loc_data, 
                            user_lat, 
                            user_long, 
                            time_of_breach, 
                            caution_zone_coords, 
                            danger_zone_coords)
    
    if log_anomaly(email, 
                user_lat, 
                user_long, 
                caution_zone_coords, 
                danger_zone_coords, 
                time_of_breach, 
                llm_eval,
                tx_hash, 
                cursor) == True:
        return JSONResponse(status_code = 200, content = {
            'llm_eval': llm_eval,
            'GRU_Autoencoder output': model_output
        })
    else:
        return JSONResponse(
            status_code = 500,
            content = {
                "llm_eval": None,
                'GRU_Autoencoder output': model_output
            }
        )