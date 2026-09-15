# Pharmacy Inventory Management System (PIMS)

Graduation project - King Hussein School of Computing Sciences, PSUT.
Prepared by Abdallah Hasan and Ahmad Sadiq, supervised by Dr. Ahmad Altamimi.

A web application that combines pharmacy inventory management, real-time patient/staff
chat, and machine-learning reorder alerts.

## Repository layout

```
/pharmacy-ims
  /client       -> React app (staff + patient portals)
  /server       -> Node.js REST API + WebSocket chat server
  /ml-service   -> Python / scikit-learn forecasting microservice
  /shared       -> constants shared by client and server
```

Setup and run instructions are added phase by phase; see the sections below.

## Prerequisites

- Node.js 22+
- Python 3.11+
- MySQL 8.x running locally
