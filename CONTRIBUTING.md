# Contributing to TestAnalyser

This guide will help you set up a local development environment to contribute to the project.

## Project Structure

- `/` - Frontend (React + Vite + Tailwind)
- `/server` - Backend (Express + Prisma + SQLite)

## Prerequisites

- Node.js (Latest LTS recommended)
- npm

## Local Setup

### 1. Install Dependencies

Install dependencies for both the frontend and the backend:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### 2. Environment Configuration

You need to set up `.env` files for both parts of the application.

#### Frontend (`/.env`)
Create a file named `.env` in the root directory:
```env
VITE_API_URL=http://localhost:4000
```

#### Backend (`/server/.env`)
Create a file named `.env` in the `server` directory:
```env
DATABASE_URL=file:./dev.db
JWT_SECRET=your-random-secret
ENCRYPTION_KEY=your-32-byte-hex-key
PORT=4000
CORS_ORIGIN=http://localhost:5173
```
*Note: You can generate keys using `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.*

### 3. Database Setup

Initialize your local SQLite database:

```bash
cd server
npx prisma migrate deploy
npx prisma generate
cd ..
```

## Running the Application

You need to run both the frontend and backend simultaneously in separate terminals.

### Start the Backend
```bash
cd server
npm run dev
```
The API will be available at `http://localhost:4000`.

### Start the Frontend
```bash
npm run dev
```
The app will be available at `http://localhost:5173`.

## Troubleshooting

- **CORS Errors**: Ensure `CORS_ORIGIN` in `server/.env` exactly matches your frontend URL (usually `http://localhost:5173`).
- **Database Issues**: If the schema changes, run `npx prisma migrate dev` in the `server` folder.
- **Missing Env Vars**: The server will fail to start if `JWT_SECRET` or `ENCRYPTION_KEY` are missing.
