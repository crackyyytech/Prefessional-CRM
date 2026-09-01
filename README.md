# Vistawin CRM

A full-stack CRM for **Vistawin**, built with **React**, **Node.js/Express**, and **MongoDB**.

## Features

- **Dashboard** — pipeline value, won revenue, and activity summaries
- **Contacts** — leads, prospects, customers with status tracking
- **Deals** — sales pipeline (lead → qualified → proposal → negotiation → won/lost)
- **Tasks** — follow-ups linked to contacts and deals
- **Documents** — upload/download files (PDF, Office, images) linked to contacts or deals
- **Roles & permissions** — Admin creates roles and toggles feature access
- **Users** — Admin assigns roles to users

## Default admin login

- Email: `admin@crm.local`
- Password: `admin123`

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- MongoDB — either:
  - **Local:** [MongoDB Community Server](https://www.mongodb.com/try/download/community) on `mongodb://127.0.0.1:27017/crm`
  - **Cloud:** [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) free cluster — set `MONGODB_URI` in `backend/.env`

## Setup

### 1. Backend

```bash
cd backend
npm install
copy .env.example .env
npm run dev
```

API runs at **http://localhost:5000**

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

App runs at **http://localhost:5173**

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET/POST | `/api/contacts` | List / create contacts |
| PUT/DELETE | `/api/contacts/:id` | Update / delete contact |
| GET/POST | `/api/deals` | List / create deals |
| PUT/DELETE | `/api/deals/:id` | Update / delete deal |
| GET/POST | `/api/tasks` | List / create tasks |
| PUT/DELETE | `/api/tasks/:id` | Update / delete task |
| GET | `/api/dashboard` | Dashboard stats |

## Project Structure

```
crm/
├── backend/          # Express + Mongoose API
│   ├── models/
│   ├── routes/
│   └── server.js
└── frontend/         # React + Vite UI
    └── src/
        ├── pages/
        └── components/
```
