from db.connection import db_pool

def remove_entries_db():
    with db_pool.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM location_data
                    WHERE id IN (
                    SELECT id
                    FROM (
                    SELECT
                    id,
                    ROW_NUMBER() OVER (
                    PARTITION BY email
                    ORDER BY timestamp DESC
                    ) AS rn
                    FROM location_data
                    ) ranked
                    WHERE rn > 100
                    );
                    """
                )
            conn.commit()