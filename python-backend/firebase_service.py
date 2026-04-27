import firebase_admin
from firebase_admin import credentials, db

if not firebase_admin._apps:
    cred = credentials.Certificate("firebase-service-account.json")
    firebase_admin.initialize_app(cred, {
        "databaseURL": "https://impostor-game-9b619-default-rtdb.asia-southeast1.firebasedatabase.app"
    })

def get_root_data():
    ref = db.reference("/")
    return ref.get()
