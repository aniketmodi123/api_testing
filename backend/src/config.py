import base64
import os
import requests
from msal import ConfidentialClientApplication
from dotenv import load_dotenv

load_dotenv('/etc/env_base')

#for sending mail
SENDER_EMAIL = os.environ.get('SENDER_EMAIL')
CLIENT_ID = os.environ.get('CLIENT_ID')
CLIENT_SECRET = os.environ.get('CLIENT_SECRET')
TENANT_ID = os.environ.get('TENANT_ID')

def send_email(subject, body, recipients_list, file_list=None):
    # Ensure file_list is always a list
    if file_list is None:
        file_list = []

    # Validate required credentials
    if not all([SENDER_EMAIL, CLIENT_ID, CLIENT_SECRET, TENANT_ID]):
        raise ValueError("Missing required environment variables: EMAIL_USER, client_id, value, tenent_id")

    try:
        # Initialize MSAL App
        app = ConfidentialClientApplication(
            CLIENT_ID, authority=f"https://login.microsoftonline.com/{TENANT_ID}",
            client_credential=CLIENT_SECRET
        )

        # Get Access Token
        token_result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])

        if not token_result or "access_token" not in token_result:
            raise Exception(f"Failed to obtain access token: {token_result.get('error_description') if token_result else 'No token response'}")

        access_token = token_result["access_token"]

        # Prepare Email Payload
        email_data = {
            "message": {
                "subject": subject,
                "body": {"contentType": "HTML", "content": body},
                "toRecipients": [{"emailAddress": {"address": email}} for email in recipients_list]
            }
        }

        # Attach Files (if any)
        if file_list:
            email_data["message"]["attachments"] = []
            for file in file_list:
                try:
                    with open(file, "rb") as f:
                        file_content = f.read()

                    attachment = {
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        "name": os.path.basename(file),
                        "contentBytes": base64.b64encode(file_content).decode("utf-8")  # Base64 Encoding
                    }
                    email_data["message"]["attachments"].append(attachment)
                except Exception as e:
                    print(f"⚠️ Warning: Failed to attach {file}: {e}")

        # Send Email Request
        headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
        SEND_EMAIL_URL = f"https://graph.microsoft.com/v1.0/users/{SENDER_EMAIL}/sendMail"

        response = requests.post(SEND_EMAIL_URL, headers=headers, json=email_data)
        response.raise_for_status()  # Raise exception for HTTP errors

        print("Email sent successfully!")
    except requests.exceptions.RequestException as e:
        print(f"Email request failed: {e}")
    except Exception as e:
        print(f"Error: {e}")