import streamlit as st
import base64
import google.generativeai as genai
from api_key import apikey

# Configure Gemini client
genai.configure(api_key=apikey)

st.set_page_config(page_title="Vital Image Analytics", layout="wide", page_icon="🤖")

st.image("healtho.jpg", width=200)
st.title("Vital Image Analytics")
st.subheader("AI-Powered Medical Image Analysis")

upload_file = st.file_uploader("Upload Medical Image", type=["png", "jpg", "jpeg", "bmp"])  

def analyze_image(file):
    file_bytes = file.read()
    # Encode file for Gemini
    encoded_image = base64.b64encode(file_bytes).decode("utf-8")

    model = genai.GenerativeModel("gemini-1.5-flash")
    response = model.generate_content([
        {"mime_type": "image/jpeg", "data": file_bytes},  # pass image directly
        "Analyze this medical image in two lines."
    ])
    return response.text

submit_button = st.button("Analyze Image")
if submit_button and upload_file:
    with st.spinner("Analyzing image..."):
        analysis_result = analyze_image(upload_file)
        st.write("### Analysis Result:")
        st.write(analysis_result)
