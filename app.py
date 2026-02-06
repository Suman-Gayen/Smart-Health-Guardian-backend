'''
===> Flask
Flask→creates backend server that acts as a middleware between IoT devices and cloud storage, processing data and
generating health reports dynamically
request →receives data from ESP32
send_file →sends PDF to user for download
==>firebase_admin
Connects Flask to Firebase Firestore
==>credentials
Authenticates Firebase using service account
==>firestore
Usedtostore and retrieve health data
==>FPDF
Generates PDF reports
==>datetime
Addstimestamp when data is stored
==>timedelta
Usedtoconvert UTC time → IST
'''

#Step1: call header file
from flask import Flask, request, send_file
import firebase_admin
from firebase_admin import credentials, firestore
from fpdf import FPDF
from datetime import datetime
from datetime import timedelta
import os # Read Firebase credentials from environment variables
import json # Required for cloud deployment

#step 2 - Flask App & Firebase Initialization
app = Flask(__name__) # Creates Flask application instance, __name__ tells Flask where the app is located

#cred = credentials.Certificate("firebase_key.json")
firebase_key = json.loads(os.environ.get("FIREBASE_KEY")) #Reads Firebase key from cloud environment(Render)
cred = credentials.Certificate(firebase_key) #Converts JSON string → Python dictionary
firebase_admin.initialize_app(cred) #Authenticates Firebase
db = firestore.client() #Creates Firestore client object (db)

#STEP3:/upload API (ESP32 →Server)
@app.route('/upload', methods=['POST'])
def upload_data():
    data = request.json #Read JSON from ESP32
    #Create Firestore Record
    record = {
        "patient_id": data['patient_id'],
        "heartrate": data['heartrate'],
        "spo2": data['spo2'],
        "timestamp": datetime.now()
    }
    db.collection("health_data").add(record) #health_data →Firestore collection
    return {"status": "Data stored successfully"}

# STEP4: Health Analysis Logic
def health_status(HR):
    if HR  < 40:
        return "WARNING"
    elif 40<= HR < 80:
        return "NORMAL"
    else:
        return "CRITICAL"

def recommendation( status ):
    if status == "NORMAL":
        return "Patient condition is healthy."
    elif status == "WARNING":
        return "Patient condition is unhealthy."
    else:
        return "Immediate medical attention required."

# STEP5: PDF Generation Function
def generate_pdf(data):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", 'B', size=18)
    pdf.SetDrawColor(0,80,180);
    pdf.SetFillColor(230,230,0);
    pdf.SetTextColor(220,50,50);
    status = health_status(data["heartrate"]) # Calculates health condition
    desc = recommendation(status) # Gets medical advice
    
    ist_time = data["timestamp"] + timedelta(hours=5, minutes=30) # Convert UTC →IST
    
    pdf.cell(200, 10, "SMART HEALTH REPORT", ln=True, align="C")
    pdf.ln(10)
    pdf.set_font("Times", 'B', size=14)
    pdf.cell(200, 10, f"Patient ID: {data['patient_id']}", ln=True)
    pdf.cell(200, 10, f"HeartRate: {data['heartrate']} bpm ", ln=True)
    pdf.cell(200, 10, f"SpO2: {data['spo2']} %", ln=True)
    pdf.cell(200, 10, f"Health Status: {status}", ln=True)
    pdf.cell(200, 10, f"Description: {desc}", ln=True)
    pdf.cell(200, 10, f"Date & Time (IST): {ist_time}", ln=True)
    # Save PDF File
    file_path = f"reports/{data['patient_id']}_report.pdf"
    pdf.output(file_path)
    return file_path

#STEP6: /download/<patient_id> API
@app.route('/download/<patient_id>')
def download_report(patient_id):
    docs = db.collection("health_data") \
             .where("patient_id", "==", patient_id) \
             .order_by("timestamp", direction=firestore.Query.DESCENDING) \
             .limit(1).stream()


    #Generate & Send PDF
    for doc in docs:
        data = doc.to_dict() # Converts Firestore document → dictionary
        path = generate_pdf(data)
        return send_file(path, as_attachment=True) # Sends file to browser for download
    
    return {"error": "No data found"}

#STEP7: Run Flask Application
if __name__ == "__main__":
     app.run()
     #app.run(host="0.0.0.0", port=5000, debug=True)