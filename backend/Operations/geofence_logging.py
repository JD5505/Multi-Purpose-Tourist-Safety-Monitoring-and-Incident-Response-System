import json

from Schema.location_data import Coordinate

def serialize_coords(coords: list[Coordinate]) -> str:
    if not coords:
        return json.dumps([])
    
    
    cleaned = []
    for c in coords:
        if hasattr(c, "model_dump"):
            cleaned.append(c.model_dump())
        elif hasattr(c, "dict"):
            cleaned.append(c.dict())
        else:
            cleaned.append(c)
            
    return json.dumps(cleaned)

def log_anomaly(email, lat, long, caution_zone_coords, danger_zone_coords, timestamp, llm_eval, blockchain_tx_hash, cursor) -> bool:
    try:
     
        caution_json = serialize_coords(caution_zone_coords)
        danger_json = serialize_coords(danger_zone_coords)

        cursor.execute(
            """
            INSERT INTO geofence_anomalies (
                email, user_lat, user_long, caution_zone_coords, 
                danger_zone_coords, timestampz, llm_evaluation, blockchain_tx_hash
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
            """,
            (email, lat, long, caution_json, danger_json, timestamp, llm_eval, blockchain_tx_hash)
        )

        cursor.execute(
                    """
                    DELETE FROM geofence_anomalies
                    WHERE id IN (
                        SELECT id 
                        FROM geofence_anomalies 
                        WHERE email = %s 
                        ORDER BY timestampz DESC 
                        OFFSET 20
                    );
                    """,
                    (email,)
                )
        
        return True
    except Exception as e:
        print(f"--> DB INSERT FAILED: {e}")
        return False

    except Exception as e:
        print(f"--> DB CLEANUP FAILED: {e}")