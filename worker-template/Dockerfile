FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir "neuralclaw[all-channels]"

WORKDIR /app
COPY start-worker.sh /app/start-worker.sh
RUN chmod +x /app/start-worker.sh

CMD ["/app/start-worker.sh"]
