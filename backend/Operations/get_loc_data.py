from Operations.calc import preprocess
import numpy as np

def get_data(email, cursor):
    cursor.execute("""
        SELECT latitude, longitude, timestamp FROM location_data
        WHERE email = %s
        ORDER BY timestamp DESC
        LIMIT 31
        """,
        (email,))

    data = cursor.fetchall()
    return data

def get_preprocessed_tensor(data):

    if len(data) < 31:
        return None 

    data.reverse()

    coords = np.array(
        [[row['latitude'], row['longitude']] for row in data], 
        dtype=np.float64
    )

    times = np.array(
        [row['timestamp'].timestamp() for row in data], 
        dtype=np.float64
    )

    return preprocess(coords, times)