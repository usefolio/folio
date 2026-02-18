FROM python:3.12-slim-bookworm
WORKDIR /opt/prefect                          
COPY libs ./libs         
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt                     
ENV PYTHONPATH=/opt/prefect/libs:$PYTHONPATH  
