# Render Deployment Checklist

## Pre-Deployment Checklist

- [ ] All files are committed to Git repository
- [ ] Repository is pushed to GitHub/GitLab
- [ ] `requirements.txt` is up to date
- [ ] Environment variables are identified
- [ ] Database schema is ready

## Deployment Steps

### 1. Create Render Account

- [ ] Sign up at [render.com](https://render.com)
- [ ] Connect your GitHub/GitLab account

### 2. ✅ Database Already Set Up

Your PostgreSQL database is already configured! Skip to step 3.

### 3. Deploy Web Service

- [ ] Click "New +" → "Web Service"
- [ ] Connect repository: `your-username/api_testing`
- [ ] Configure service:
  - Name: `api-testing-backend`
  - Environment: Python 3
  - Build Command: `./build.sh`
  - Start Command: `python start.py`
  - Plan: Free

### 4. Set Environment Variables

Go to your web service → Environment and add:

```bash
# Database Configuration (use your existing database details)
PRODUCTION_POSTGRES_HOST=<your-existing-postgres-host>
PRODUCTION_POSTGRES_USER=<your-existing-postgres-user>
PRODUCTION_POSTGRES_PASSWORD=<your-existing-postgres-password>
PRODUCTION_POSTGRES_DB=api_testing
PRODUCTION_POSTGRES_PORT=5432

# JWT Configuration
JWT_SECRET_KEY=<generate-random-secret-key>
JWT_ALGORITHM=HS256
```

### 5. Deploy and Test

- [ ] Trigger manual deploy or push to main branch
- [ ] Wait for build to complete (5-10 minutes)
- [ ] Check build logs for errors
- [ ] Test endpoints:
  - [ ] `GET https://your-app.onrender.com/` - Root endpoint
  - [ ] `GET https://your-app.onrender.com/health` - Health check
  - [ ] `GET https://your-app.onrender.com/swagger` - API documentation

## Post-Deployment

### Verify Functionality

- [ ] API responds correctly
- [ ] Database connections work
- [ ] Authentication endpoints work
- [ ] All routes are accessible
- [ ] CORS is configured properly

### Monitor

- [ ] Check Render logs for errors
- [ ] Monitor database connections
- [ ] Test with your frontend application
- [ ] Set up uptime monitoring (optional)

## Troubleshooting Common Issues

### Build Fails

- Check `requirements.txt` for invalid packages
- Ensure Python version compatibility
- Review build logs in Render dashboard

### Database Connection Fails

- Verify all database environment variables
- Check database status in Render dashboard
- Ensure database allows external connections

### App Crashes on Startup

- Check application logs
- Verify all required environment variables are set
- Test database connectivity

### SSL/TLS Issues

- App includes relaxed SSL settings for development
- For production, review SSL configuration in `config.py`

## Environment Variables Reference

| Variable                       | Example                                | Required | Description       |
| ------------------------------ | -------------------------------------- | -------- | ----------------- |
| `PRODUCTION_POSTGRES_HOST`     | `dpg-xxx-a.oregon-postgres.render.com` | ✅       | Database hostname |
| `PRODUCTION_POSTGRES_USER`     | `api_testing_user`                     | ✅       | Database username |
| `PRODUCTION_POSTGRES_PASSWORD` | `generated-password`                   | ✅       | Database password |
| `PRODUCTION_POSTGRES_DB`       | `api_testing`                          | ✅       | Database name     |
| `PRODUCTION_POSTGRES_PORT`     | `5432`                                 | ✅       | Database port     |
| `JWT_SECRET_KEY`               | `your-secret-key-here`                 | ✅       | JWT signing key   |
| `JWT_ALGORITHM`                | `HS256`                                | ✅       | JWT algorithm     |

## Resources

- [Render Python Documentation](https://render.com/docs/deploy-fastapi)
- [FastAPI Deployment Guide](https://fastapi.tiangolo.com/deployment/)
- [Render Support](https://render.com/docs)

---

**Note:** Free tier limitations:

- Services sleep after 15 minutes of inactivity
- Database has connection limits
- Monthly build minutes are limited
