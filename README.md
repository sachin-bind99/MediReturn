# MediReturn

MediReturn is a pharmacy inventory workspace built with React, Vite, Tailwind
CSS, Node.js, Express, and MongoDB.

## Features

- Email and Google sign-in, account registration, and password reset
- Medicine catalog with barcode lookup and OCR-assisted scanning
- Inventory batches, expiry and return alerts, and activity history
- Supplier records and role-controlled supplier return requests
- Dashboard summaries and CSV inventory export

Records are scoped to the signed-in account. Return status changes are limited
to staff and administrators by the API.

## Requirements

- Node.js and npm
- MongoDB, local or hosted

## Configure the server

Create `server/.env` with a MongoDB connection URI and a private `JWT_SECRET`
of at least 32 characters. Google sign-in and password reset also need their
respective Google OAuth and SMTP settings. Keep real credentials private and
out of version control.

The server uses the `medireturn` database. See `server/.env.example` for the
supported environment variable names.

## Run locally

In one terminal:

```sh
cd server
npm install
npm run dev
```

In a second terminal:

```sh
cd client
npm install
npm run dev
```

The client defaults to `http://localhost:5000/api`. Set `VITE_API_URL` to the
full API base URL, including `/api`, to use another server. Set
`VITE_GOOGLE_CLIENT_ID` in the client environment to enable Google sign-in.

## Checks

Run these from `client/`:

```sh
npm run lint
npm run build
```

Run the server's alert-generation checks from `server/`:

```sh
node testAlertGenerator.js
```
