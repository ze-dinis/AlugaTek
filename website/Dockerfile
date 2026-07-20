FROM nginx:1.27-alpine

ENV PORT=80

COPY website/nginx.main.conf /etc/nginx/nginx.conf
COPY website/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY website/index.html /usr/share/nginx/html/index.html
COPY website/blue.png /usr/share/nginx/html/blue.png
COPY website/Screenshot_01.png /usr/share/nginx/html/Screenshot_01.png
