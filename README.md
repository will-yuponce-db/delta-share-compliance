# Delta Sharing Compliance Manager

A modern web application for managing Delta Sharing compliance across multiple Databricks environments with tag validation and AI-powered agreement parsing.

## Features

- **Multi-Environment Support**: Connect to multiple Databricks workspaces
- **Delta Sharing Integration**: Browse shares, schemas, and tables
- **Unity Catalog Tags**: Apply and manage tags across assets
- **Compliance Validation**: Automated validation against sharing agreements
- **AI-Powered Parsing**: Extract tag requirements from agreements (stubbed)
- **Real-time Dashboards**: Monitor compliance metrics with visualizations
- **Remediation Tools**: Quick-fix non-compliant assets

## Tech Stack

### Frontend
- React 18 with Vite
- Material-UI (MUI) for components
- React Router for navigation
- Recharts for data visualization
- Axios for API calls

### Backend
- Node.js + Express
- Stubbed Unity Catalog REST API
- Stubbed Delta Sharing REST API
- In-memory data store

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Backend Setup**
```bash
cd backend
npm install
npm start
```
The backend will run on http://localhost:3001

2. **Frontend Setup**
```bash
cd frontend
npm install
npm run dev
```
The frontend will run on http://localhost:5173

### Default Environment Data

The application comes with 3 pre-configured environments:
- **Production** (prod.databricks.com) - 2 shares, 15 tables
- **Staging** (staging.databricks.com) - 1 share, 8 tables
- **Partner Workspace** (partner.databricks.com) - 2 shares, 12 tables

## Security Considerations

### Auth Token Storage

**Current Implementation (Demo):**
- Tokens are stored in memory on the backend
- Frontend masks tokens in the UI (only shows first 8 characters)
- Password input fields for entering tokens

**Production Recommendations:**
1. **Never store tokens in plain text**
2. **Use environment variables** for configuration
3. **Integrate with secrets managers:**
   - AWS Secrets Manager
   - Azure Key Vault
   - HashiCorp Vault
   - Databricks Secret Scopes
4. **Implement token encryption** at rest
5. **Use OAuth 2.0 or Service Principals** instead of personal access tokens
6. **Rotate tokens regularly** and implement expiration
7. **Audit token access** and usage

### Additional Security Features to Implement

- [ ] User authentication (OAuth, SAML, etc.)
- [ ] Role-based access control (RBAC)
- [ ] Audit logging for all operations
- [ ] HTTPS/TLS for all communications
- [ ] Input validation and sanitization
- [ ] Rate limiting on API endpoints
- [ ] CORS configuration for production
- [ ] Security headers (CSP, HSTS, etc.)

## Project Structure

```
data-compliance/
├── backend/
│   ├── server.js
│   ├── routes/
│   ├── services/
│   └── data/
└── frontend/
    ├── src/
    │   ├── pages/
    │   ├── components/
    │   ├── services/
    │   ├── store/
    │   └── utils/
    └── public/
```

## API Endpoints

### Environments
- `GET /api/environments` - List all environments
- `POST /api/environments` - Create environment
- `PUT /api/environments/:id` - Update environment
- `DELETE /api/environments/:id` - Delete environment

### Delta Sharing
- `GET /api/delta-sharing/:env/shares` - List shares
- `GET /api/delta-sharing/:env/shares/:share/schemas` - List schemas
- `GET /api/delta-sharing/:env/shares/:share/tables` - List tables

### Unity Catalog
- `GET /api/unity-catalog/:env/tags/:share/:schema/:table` - Get tags
- `PUT /api/unity-catalog/:env/tags/:share/:schema/:table` - Set tags

### Validation
- `GET /api/validation/overview` - Compliance overview
- `GET /api/validation/all` - Validate all assets
- `GET /api/validation/violations` - Get violations

### Agreements
- `GET /api/agreements` - List agreements
- `POST /api/agreements` - Create agreement
- `POST /api/agreements/parse` - Parse agreement content

## Demo Workflow

1. **View Dashboard**: See compliance score across all environments
2. **Browse Shares**: Explore shared tables and volumes
3. **Check Compliance**: View detailed violations
4. **Apply Tags**: Use bulk tag editor or individual asset editor
5. **Validate**: Re-run validation to see updated compliance
6. **Create Agreement**: Upload new sharing agreement and extract requirements

## Development

### Running in Development Mode

Backend (with auto-reload):
```bash
cd backend
npm run dev
```

Frontend (with hot-reload):
```bash
cd frontend
npm run dev
```

### Building for Production

```bash
cd frontend
npm run build
```

## Future Enhancements

- [ ] Real Databricks/Unity Catalog integration
- [ ] Real AI/LLM integration for agreement parsing
- [ ] Persistent database (PostgreSQL/MySQL)
- [ ] User authentication and authorization
- [ ] Secure secrets management
- [ ] Audit logs and change history
- [ ] Email notifications for violations
- [ ] Scheduled compliance scans
- [ ] Export compliance reports (PDF/CSV)
- [ ] Tag templates and bulk operations
- [ ] Advanced search and filtering
- [ ] Multi-tenancy support
- [ ] Webhook integrations

## License

MIT
