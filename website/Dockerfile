FROM nginx:1.27-alpine

ENV PORT=80

COPY website/nginx.main.conf /etc/nginx/nginx.conf
COPY website/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY website/index.html /usr/share/nginx/html/index.html
COPY website/favicon.ico /usr/share/nginx/html/favicon.ico
COPY website/blue.png /usr/share/nginx/html/blue.png
COPY website/Screenshot_01.png /usr/share/nginx/html/Screenshot_01.png
COPY website/robots.txt /usr/share/nginx/html/robots.txt
COPY website/sitemap.xml /usr/share/nginx/html/sitemap.xml
