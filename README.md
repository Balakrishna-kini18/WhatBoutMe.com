# WhatBoutMe

Welcome to the **WhatBoutMe** monorepo! This repository contains the complete course platform, consisting of a Learner portal, an Admin dashboard, a Marketing website, and a centralized NestJS backend.

## 🏗️ Project Structure

This project uses **Turborepo** to manage multiple applications and shared packages in a single repository.

### Applications (`/apps`)

* **`apps/lms`** (Frontend) - The **Learner Portal**. This is where students log in to view their courses, watch videos, and take quizzes. Built with Next.js.
* **`apps/admin`** (Frontend) - The **Admin Dashboard**. This is where staff manage programs, users, revenue, and content. Built with Next.js.
* **`apps/marketing`** (Frontend) - The **Public Website**. The landing page that visitors see before logging in. Built with Next.js.
* **`apps/api`** (Backend) - The **Core Backend API**. Handles business logic, database queries, authentication, and payments. Built with NestJS and Prisma.

### Packages (`/packages`)

* **`packages/ui`** - Shared React components used across the frontends.
* **`packages/eslint-config`** & **`packages/typescript-config`** - Shared configuration files.

---

## 🚀 Getting Started

Follow these steps to run the complete platform on your local machine.

### 1. Prerequisites

Ensure you have the following installed:

* [Node.js](https://nodejs.org/) (Version 24 or newer recommended)
* npm (Version 11 or newer)

### 2. Clone and Install

First, clone the repository and install all dependencies:

```bash
git clone https://github.com/Gagan-k0/WhatBoutMe.git
cd WhatBoutMe
npm install
```

### 3. Environment Setup

The backend requires a PostgreSQL database to run.

1. Navigate to `apps/api/`
2. Create a `.env` file (if it doesn't exist) and add your database URL and JWT secrets :

```env
DATABASE_URL="postgresql://your_db_user:password@host/database"
JWT_SECRET="your-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret-key"
```

3. Generate the Prisma database client:

```bash
cd apps/api
npx prisma generate
cd ../..
```

### 4. Run the Project

To start **all** applications and the backend simultaneously, run this command from the root of the repository:

```bash
npm run dev
```

### 5. Where is everything running?

Once the `npm run dev` command finishes starting up, you can access the different parts of the platform in your browser:

* 🌐 **Marketing Website:** [http://localhost:3001](http://localhost:3001)
* 🎓 **Learner Portal:** [http://localhost:3003](http://localhost:3003)
* ⚙️ **Admin Dashboard:** [http://localhost:3002](http://localhost:3002)
* 🔌 **Backend API:** [http://localhost:4000](http://localhost:4000)

*(Note: Learners can sign in or register directly on the Marketing Website at `localhost:3001/login` or `localhost:3001/signup` which seamlessly hands over sessions to the Learner Portal at `localhost:3003`!)*

---

## ☁️ Deployment (Vercel)

This monorepo is fully configured for deployment on Vercel.
When importing the project into Vercel, you must deploy each app separately by changing the **Root Directory** in the Vercel project settings:

1. Create a Vercel project and select `apps/api` as the root directory for the backend.
2. Create another project and select `apps/lms` as the root directory for the Learner portal.
3. Create a final project and select `apps/admin` as the root directory for the Admin dashboard.

Make sure to add the `DATABASE_URL` and `NEXT_PUBLIC_API_URL` environment variables in Vercel for the apps that need them!
