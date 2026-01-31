#step 1
from flask import Flask, request, send_file
import firebase_admin
from firebase_admin import credentials, firestore
from fpdf import FPDF
from datetime import datetime
#from datetime import timedelta

#Handle Firebase Key
import os
import json

#step 2
app = Flask(__name__)

#cred = credentials.Certificate("firebase_key.json")
firebase_key = json.loads(os.environ.get("FIREBASE_KEY"))
cred = credentials.Certificate(firebase_key)
firebase_admin.initialize_app(cred)
db = firestore.client()
#step 3
@app.route('/upload', methods=['POST'])
def upload_data():
    data = request.json

    record = {
        "patient_id": data['patient_id'],
        "temperature": data['temperature'],
        "humidity": data['humidity'],
        "timestamp": datetime.now()
    }

    db.collection("health_data").add(record)
    return {"status": "Data stored successfully"}

#ist_time = data["timestamp"] + timedelta(hours=5, minutes=30)

#step 4
def health_status(temp):
    if temp < 37:
        return "NORMAL"
    elif 37 <= temp < 50:
        return "WARNING"
    else:
        return "CRITICAL"

def recommendation( status ):
    if status == "NORMAL":
        return "Patient condition is stable."
    elif status == "WARNING":
        return "Monitor temperature every 2 hours."
    else:
        return "Immediate medical attention required."

#step 5
def generate_pdf(data):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    status = health_status(data["temperature"])
    desc = recommendation(status)
    
    pdf.cell(200, 10, "SMART HEALTH REPORT", ln=True, align="C")
    pdf.ln(10)
    pdf.cell(200, 10, f"Patient ID: {data['patient_id']}", ln=True)
    pdf.cell(200, 10, f"Temperature: {data['temperature']} °C", ln=True)
    pdf.cell(200, 10, f"Humidity: {data['humidity']} %", ln=True)
    pdf.cell(200, 10, f"Health Status: {status}", ln=True)
    pdf.cell(200, 10, f"Description: {desc}", ln=True)
    pdf.cell(200, 10, f"Date: {data['timestamp']}", ln=True)
    #pdf.cell(200, 10, f"Date & Time (IST): {ist_time}", ln=True)

    #file_path = "reports/health_report.pdf"
    file_path = f"reports/{data['patient_id']}_report.pdf"
    pdf.output(file_path)
    return file_path

#step 6
@app.route('/download/<patient_id>')
def download_report(patient_id):
    docs = db.collection("health_data") \
             .where("patient_id", "==", patient_id) \
             .order_by("timestamp", direction=firestore.Query.DESCENDING) \
             .limit(1).stream()

    for doc in docs:
        data = doc.to_dict()
        path = generate_pdf(data)
        return send_file(path, as_attachment=True)

    return {"error": "No data found"}

#step 7
if __name__ == "__main__":
    #app.run(host="0.0.0.0", port=5000, debug=True)
     app.run()