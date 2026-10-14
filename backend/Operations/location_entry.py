from db.connection import db_pool
def enter_location(email: str, samples_tuples: list, cursor):
    if not samples_tuples:
        return

    rows = [(email, row[0], row[1], row[2]) for row in samples_tuples]
    value_placeholders = ",".join(["(%s, %s, %s, %s)"] * len(rows))
    flat_params = [item for sublist in rows for item in sublist]

    query = f"""
        INSERT INTO location_data (email, latitude, longitude, timestamp)
        VALUES {value_placeholders}
        ON CONFLICT (email, timestamp) DO NOTHING
    """

    with db_pool.connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, flat_params)
            conn.commit()
    return True