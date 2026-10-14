import config
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


conninfo = (
    f"host={config.hostname} "
    f"dbname={config.database} "
    f"user={config.username} "
    f"password={config.pwd} "
    f"port={config.port_id}"
)

db_pool = ConnectionPool(
    conninfo=conninfo,
    min_size=2,
    max_size=10,
    kwargs={"row_factory": dict_row},
    open=True
)

def get_db():
    with db_pool.connection() as conn:
        with conn.cursor() as cursor:
            yield cursor