import asyncio
import redis.asyncio as aioredis
from app.config import get_settings

async def main():
    settings = get_settings()
    url = settings.redis_url
    print(f"Connecting to: {url}")
    
    r = await aioredis.from_url(url, ssl_cert_reqs="none")
    try:
        await r.ping()
        print("PING SUCCESS")
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        await r.close()

if __name__ == "__main__":
    asyncio.run(main())
