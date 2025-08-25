import streamlit as st
import base64
import google.generativeai as genai

from api_key import apikey

# Configure Gemini client
genai.configure(api_key=apikey)

# Set page configuration
st.set_page_config(page_title="Vital Image Analytics", layout="wide", page_icon="�")


st.image("healtho.jpg", width=200)
st.title("Vital Image Analytics")
st.subheader("AI-Powered Medical Image Analysis")

# File uploader for the medical image
upload_file = st.file_uploader("Upload Medical Image", type=["png", "jpg", "jpeg", "bmp"])  

# Text input for the user's question
text_input = st.text_input("Enter your question or a prompt:")

def get_gemini_response(uploaded_file, text_prompt):
    """
    Constructs and sends a request to the Gemini model based on the
    presence of an image, text, or both.
    """
    model = genai.GenerativeModel("gemini-1.5-flash")
    
    # List to hold the content parts for the model
    content_parts = []
    
    # Case 1: Handle both image and text input
    if uploaded_file is not None and text_prompt:
        image_bytes = uploaded_file.read()
        content_parts.append({"mime_type": uploaded_file.type, "data": image_bytes})
        content_parts.append(text_prompt)
        
    # Case 2: Handle only image input
    elif uploaded_file is not None:
        image_bytes = uploaded_file.read()
        content_parts.append({"mime_type": uploaded_file.type, "data": image_bytes})
        content_parts.append("Analyze this image.")
        
    # Case 3: Handle only text input
    elif text_prompt:
        content_parts.append(text_prompt)
        
    # If no content, return an error message
    if not content_parts:
        return "Please upload an image or enter a question to analyze."

    try:
        response = model.generate_content(content_parts)
        return response.text
    except Exception as e:
        return f"An error occurred during analysis: {e}"

# Add a button to trigger the analysis
submit_button = st.button("Analyze Content")

# Logic to handle the button click
if submit_button:
    with st.spinner("Analyzing content..."):
        analysis_result = get_gemini_response(upload_file, text_input)
        
        # Display the result
        st.write("### Analysis Result:")
        st.write(analysis_result)
