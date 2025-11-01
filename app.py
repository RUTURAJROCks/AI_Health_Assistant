import streamlit as st
from google import genai
from google.genai import types

from api_key import apikey   # ensure this contains your GOOGLE_API_KEY


# Configure Gemini client
client = genai.Client(api_key=apikey)


# Streamlit UI
st.set_page_config(page_title="Vital Image Analytics", layout="wide")
st.image("healtho.jpg", width=200)
st.title("Vital Image Analytics")
st.subheader("AI-Powered Medical Image Analysis")

uploaded_file = st.file_uploader("Upload Medical Image", 
                                 type=["png", "jpg", "jpeg", "bmp"])

text_prompt = st.text_input("Enter your question or prompt:")


# Gemini request handler (updated)
def get_gemini_response(uploaded_file, text_prompt):
    contents = []

    # Case 1: Image + Text
    if uploaded_file and text_prompt:
        image_bytes = uploaded_file.read()
        contents.append(
            types.Part.from_bytes(
                data=image_bytes,
                mime_type=uploaded_file.type
            )
        )
        contents.append(text_prompt)

    # Case 2: Image only
    elif uploaded_file:
        image_bytes = uploaded_file.read()
        contents.append(
            types.Part.from_bytes(
                data=image_bytes,
                mime_type=uploaded_file.type
            )
        )
        contents.append("Analyze this medical image.")

    # Case 3: Text only
    elif text_prompt:
        contents.append(text_prompt)

    # If nothing
    else:
        return "Please upload an image or enter a prompt."

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents
        )
        return response.text

    except Exception as e:
        return f"Error: {str(e)}"


# Run Analysis
if st.button("Analyze Content"):
    with st.spinner("Analyzing..."):
        result = get_gemini_response(uploaded_file, text_prompt)

    st.write("### Analysis Result:")
    st.write(result)
