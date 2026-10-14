import hashlib
import os
from web3 import Web3


ALCHEMY_URL = os.getenv("ALCHEMY_URL")
WALLET_ADDRESS = os.getenv("WALLET_ADDRESS") 
PRIVATE_KEY = os.getenv("PRIVATE_KEY")

w3 = Web3(Web3.HTTPProvider(ALCHEMY_URL))

def log_to_blockchain(email, lat, long, timestampz):
    if not w3.is_connected():
        print("Blockchain network down. Skipping Web3 log.")
        return None

    checksum_address = w3.to_checksum_address(WALLET_ADDRESS)

    time_str = timestampz.strftime("%Y-%m-%dT%H:%M:%S")
    raw_data = f"{email}|{lat}|{long}|{time_str}"
 
    print(f"\n[EXACT PYTHON INPUT] -> [{raw_data}]\n")

    data_hash = hashlib.sha256(raw_data.encode()).hexdigest()

    tx = {
        'nonce': w3.eth.get_transaction_count(checksum_address),
        'to': checksum_address,
        'value': 0,
        'gas': 200000, 
        'gasPrice': w3.eth.gas_price,
        'data': w3.to_hex(text=data_hash),
        'chainId': w3.eth.chain_id  
    }
    
    signed_tx = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
    
    raw_bytes = getattr(signed_tx, 'raw_transaction', getattr(signed_tx, 'rawTransaction', None))
    tx_hash = w3.eth.send_raw_transaction(raw_bytes)
    
    return w3.to_hex(tx_hash)