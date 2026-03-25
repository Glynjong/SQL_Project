# Docker Setup Guide for SQL Visual Debugger

## Prerequisites
- Docker Desktop installed ([Download](https://www.docker.com/products/docker-desktop))
- Docker Compose (included with Docker Desktop)

## Quick Start

### Build and Run All Services
```bash
docker-compose up --build
```

This will start:
- **PostgreSQL** - Database on `localhost:5432`
- **Backend** - Express server on `localhost:5000`
- **Frontend** - React app on `localhost:80` (http://localhost)
- **pgAdmin4** - Database manager on `localhost:5050` (http://localhost:5050)

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

## File Structure

- **Backend/Dockerfile** - Multi-stage build for Node.js backend
- **Frontend/Dockerfile** - Multi-stage build for React frontend (Nginx serving)
- **docker-compose.yml** - Orchestrates all services
- **.env** - Environment variables for local development

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌─────────────────────────────────────────┐        │
│  │   Frontend (React + Nginx) :80          │        │
│  ├─────────────────────────────────────────┤        │
│  │        Nginx Proxy                      │        │
│  │   /api/* → http://backend:5000/*       │        │
│  └─────────────────────────────────────────┘        │
│                      │                               │
│  ┌───────────────────┴────────────────────┐         │
│  │  Backend (Express) :5000               │         │
│  ├────────────────────────────────────────┤         │
│  │  PostgreSQL :5432                      │         │
│  └────────────────────────────────────────┘         │
│                                                      │
│  pgAdmin4 :5050 (Web UI for database management)   │
│                                                      │
└──────────────────────────────────────────────────────┘
     All services on: sql-debugger-network
```

## Environment Variables

### Backend (.env)
- `DB_USER` - PostgreSQL username (default: postgres)
- `DB_PASSWORD` - PostgreSQL password (default: 1)
- `DB_HOST` - Database host (Docker: postgres, Local: localhost)
- `DB_PORT` - Database port (default: 5432)
- `DB_NAME` - Database name (default: SQL_Database)
- `NODE_ENV` - Environment (development/production)

## Development Notes

### Running Locally (Without Docker)
1. Start PostgreSQL on your machine
2. Update Backend/server.js connection details if needed
3. Run backend: `cd Backend && npm install && node server.js`
4. Run frontend: `cd Frontend && npm install && npm start`
5. Frontend will open on http://localhost:3000

### Building Docker Images Manually
```bash
# Backend
cd Backend
docker build -t sql-debugger-backend .

# Frontend
cd Frontend
docker build -t sql-debugger-frontend .
```

### Push to Docker Hub
```bash
docker tag sql-debugger-backend username/sql-debugger-backend:1.0
docUsing pgAdmin4

### Access pgAdmin4
1. Open http://localhost:5050 in your browser
2. Login with:
   - **Email**: `admin@admin.com`
   - **Password**: `admin`

### Add PostgreSQL Server to pgAdmin4
1. Click "Add New Server"
2. Fill in the **Connection** tab:
   - **Host**: `postgres` (Docker hostname)
   - **Port**: `5432`
   - **Username**: `postgres`
   - **Password**: `1`
   - **Database**: `SQL_Database`
3. Click **Save**

The server will now be available in pgAdmin4 to browse tables, run queries, and manage data.

## ker push username/sql-debugger-backend:1.0

docker tag sql-debugger-frontend username/sql-debugger-frontend:1.0
docker push username/sql-debugger-frontend:1.0
```

## Cleanup

### Remove Stopped Containers
```bash
docker-compose rm
```

### Remove All Unused Images
```bash
docker image prune
```

### Reset Database Volume
```bash
docker-compose down -v
```

## Troubleshooting

### Backend Can't Connect to Database
- Ensure PostgreSQL container is healthy: `docker-compose logs postgres`
- Check DB credentials in docker-compose.yml
- Verify backend environment variables are set correctly

### Frontend Shows "Cannot Connect to API"
- Check backend logs: `docker-compose logs backend`
- Verify Nginx proxy configuration in Frontend/nginx.conf
- Ensure frontend can resolve "backend" hostname

### Port Already in Use
```bash
# Change ports in docker-compose.yml
# Example: change frontend from 80:80 to 8080:80
```

## References
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js Docker Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
