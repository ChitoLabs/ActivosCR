FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy static files
COPY public/ /usr/share/nginx/html/

# Create directories for uploads and branding  
RUN mkdir -p /usr/share/nginx/html/data/branding \
             /usr/share/nginx/html/uploads

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]