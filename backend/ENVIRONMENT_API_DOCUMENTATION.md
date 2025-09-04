# Environment Management System - API Documentation

## Overview

This system provides Postman-like environment variable}

````

#### 2. **List Environments**I testing. Users can create multiple environments per workspace, manage variables with secret handling, and resolve variables in API requests using `{{variable_name}}` syntax.

**Key Features:**

- Multiple environments per workspace
- Only one active environment at a time
- Secret variable masking
- Variable resolution in API requests
- Template-based environment creation

---

## 🏗️ **Response Format**

All APIs use standardized response format:

```typescript
interface ApiResponse {
  success: boolean;
  status_code: number;
  data?: any; // Present on success
  error_message?: string; // Present on error
}
````

---

## 📊 **Data Models**

### Environment Object

```typescript
interface Environment {
  id: number;
  workspace_id: number;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  variables?: EnvironmentVariable[]; // Only in detailed view
}
```

### Environment Variable Object

```typescript
interface EnvironmentVariable {
  id: number;
  environment_id: number;
  key: string;
  value: string; // Shows "***" for secret variables
  description?: string;
  is_enabled: boolean;
  is_secret: boolean;
  created_at: string;
  updated_at: string;
}
```

### Variable Resolution Objects

```typescript
interface VariableResolutionRequest {
  text: string;
  environment_id?: number; // Optional, uses active if not provided
}

interface VariableResolutionResponse {
  original_text: string;
  resolved_text: string;
  variables_found: string[];
  variables_resolved: string[];
  variables_missing: string[];
  environment_used?: string;
}
```

---

## 🔧 **API Endpoints**

### **Environment Management**

#### 1. **Create Environment**

```http
POST /workspace/{workspace_id}/environments
Headers: username: {current_username}
Content-Type: application/json

Body:
{
  "name": "Development",
  "description": "Development environment variables",
  "is_active": false,
  "variables": [  // Optional
    {
      "key": "API_URL",
      "value": "http://localhost:8000",
      "description": "Base API URL",
      "is_enabled": true,
      "is_secret": false
    }
  ]
}

Response:
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": 1,
    "name": "Development",
    "description": "Development environment variables",
    "is_active": false,
    "workspace_id": 1,
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  }
}
```

#### 2. **Create Environment from Template** ⚠️ _Optional_

```http
POST /workspace/{workspace_id}/environments/from-template/{template_name}
Headers: username: {current_username}

Available templates:
- api_testing (API_URL, AUTH_TOKEN, REQUEST_TIMEOUT)
- development (DEBUG_MODE, DATABASE_URL, LOG_LEVEL)
- production (PRODUCTION_URL, SECURE_TOKEN, CACHE_ENABLED)

Response: Environment object with pre-configured variables
```

#### 3. **List Environments**

```http
GET /workspace/{workspace_id}/environments
Headers: username: {current_username}

Response:
{
  "success": true,
  "status_code": 200,
  "data": {
    "environments": [
      {
        "id": 1,
        "name": "Development",
        "description": "Dev environment",
        "is_active": true,
        "workspace_id": 1,
        "created_at": "2024-01-01T00:00:00",
        "updated_at": "2024-01-01T00:00:00"
      }
    ],
    "total_count": 1,
    "active_environment": {
      "id": 1,
      "name": "Development",
      // ... complete environment object
    }
  }
}
```

#### 3. **Get Specific Environment**

```http
GET /workspace/{workspace_id}/environments/{environment_id}
Headers: username: {current_username}

Response:
{
  "success": true,
  "status_code": 200,
  "data": {
    "id": 1,
    "name": "Development",
    "description": "Dev environment",
    "is_active": true,
    "workspace_id": 1,
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00",
    "variables": [
      {
        "id": 1,
        "key": "API_URL",
        "value": "http://localhost:8000", // Shows "***" for secrets
        "description": "Base API URL",
        "is_enabled": true,
        "is_secret": false,
        "environment_id": 1,
        "created_at": "2024-01-01T00:00:00",
        "updated_at": "2024-01-01T00:00:00"
      }
    ]
  }
}
```

#### 4. **Update Environment**

```http
PUT /workspace/{workspace_id}/environments/{environment_id}
Headers: username: {current_username}
Content-Type: application/json

Body:
{
  "name": "Updated Name",     // Optional
  "description": "New description", // Optional
  "is_active": true          // Optional - setting to true deactivates others
}

Response:
{
  "success": true,
  "status_code": 200,
  "data": {
    // Updated Environment object
  }
}
```

#### 5. **Activate Environment**

```http
POST /workspace/{workspace_id}/environments/{environment_id}/activate
Headers: username: {current_username}

Response:
{
  "success": true,
  "status_code": 200,
  "data": {
    // Environment object (now active)
  }
}

Note: Automatically deactivates other environments in workspace
```

#### 6. **Delete Environment**

```http
DELETE /workspace/{workspace_id}/environments/{environment_id}
Headers: username: {current_username}

Response:
{
  "success": true,
  "status_code": 200,
  "data": {
    "message": "Environment 'Development' deleted successfully"
  }
}
```

---

### **Variable Management**

#### 1. **Create Variable**

```http
POST /workspace/{workspace_id}/environments/{environment_id}/variables
Headers: username: {current_username}
Content-Type: application/json

Body:
{
  "key": "DATABASE_URL",
  "value": "postgresql://localhost:5432/mydb",
  "description": "Database connection string",
  "is_enabled": true,
  "is_secret": true
}

Response:
{
  "success": true,
  "status_code": 201,
  "data": {
    "id": 1,
    "key": "DATABASE_URL",
    "value": "***", // Masked for secrets
    "description": "Database connection string",
    "is_enabled": true,
    "is_secret": true,
    "environment_id": 1,
    "created_at": "2024-01-01T00:00:00",
    "updated_at": "2024-01-01T00:00:00"
  }
}
```

#### 2. **List Variables**

```http
GET /workspace/{workspace_id}/environments/{environment_id}/variables
Headers: username: {current_username}

Response:
{
  "success": true,
  "status_code": 200,
  "data": [
    {
      "id": 1,
      "key": "API_URL",
      "value": "http://localhost:8000",
      "description": "Base API URL",
      "is_enabled": true,
      "is_secret": false,
      "environment_id": 1,
      "created_at": "2024-01-01T00:00:00",
      "updated_at": "2024-01-01T00:00:00"
    },
    {
      "id": 2,
      "key": "SECRET_KEY",
      "value": "***", // Masked for secrets
      "description": "API Secret",
      "is_enabled": true,
      "is_secret": true,
      "environment_id": 1,
      "created_at": "2024-01-01T00:00:00",
      "updated_at": "2024-01-01T00:00:00"
    }
  ]
}
```

#### 3. **Get Specific Variable** ⚠️ _Optional_

```http
GET /workspace/{workspace_id}/environments/{environment_id}/variables/{variable_id}
Headers: username: {current_username}

Response:
{
  "success": true,
  "status_code": 200,
  "data": {
    // EnvironmentVariable object
  }
}

Note: Consider removing - can use list variables instead
```

#### 4. **Update Variable**

```http
PUT /workspace/{workspace_id}/environments/{environment_id}/variables/{variable_id}
Headers: username: {current_username}
Content-Type: application/json

Body:
{
  "key": "UPDATED_KEY",      // Optional
  "value": "new_value",      // Optional
  "description": "Updated description", // Optional
  "is_enabled": false,       // Optional
  "is_secret": true         // Optional
}

Response:
{
  "success": true,
  "status_code": 200,
  "data": {
    // Updated EnvironmentVariable object
  }
}
```

#### 5. **Delete Variable**

```http
DELETE /workspace/{workspace_id}/environments/{environment_id}/variables/{variable_id}
Headers: username: {current_username}

Response:
{
  "success": true,
  "status_code": 200,
  "data": {
    "message": "Variable 'API_URL' deleted successfully"
  }
}
```

---

### **Variable Resolution**

#### 1. **Get Active Environment Variables**

```http
GET /workspace/{workspace_id}/environments/active/variables
Headers: username: {current_username}

Response:
{
  "success": true,
  "status_code": 200,
  "data": {
    "variables": {
      "API_URL": "http://localhost:8000",
      "AUTH_TOKEN": "secret_token_value"
    },
    "environment_name": "Development",
    "environment_id": 1,
    "resolved_count": 2
  }
}

Note: Returns actual values (including secrets) for resolution purposes
```

#### 2. **Get Environment Variables Resolved** ⚠️ _Consider Removing_

```http
GET /workspace/{workspace_id}/environments/{environment_id}/variables/resolved
Headers: username: {current_username}

Response: Same as above but for specific environment
Note: Redundant with active variables endpoint
```

#### 3. **Resolve Variables in Text**

```http
POST /workspace/{workspace_id}/environments/resolve
Headers: username: {current_username}
Content-Type: application/json

Body:
{
  "text": "GET {{API_URL}}/users with token {{AUTH_TOKEN}}",
  "environment_id": 1  // Optional, uses active environment if not provided
}

Response:
{
  "success": true,
  "status_code": 200,
  "data": {
    "original_text": "GET {{API_URL}}/users with token {{AUTH_TOKEN}}",
    "resolved_text": "GET http://localhost:8000/users with token secret_token_value",
    "variables_found": ["API_URL", "AUTH_TOKEN"],
    "variables_resolved": ["API_URL", "AUTH_TOKEN"],
    "variables_missing": [],
    "environment_used": "Development"
  }
}
```

#### 4. **Resolve Variables with Specific Environment** ⚠️ _Consider Removing_

```http
POST /workspace/{workspace_id}/environments/{environment_id}/resolve
Headers: username: {current_username}
Content-Type: application/json

Body:
{
  "text": "GET {{API_URL}}/users"
}

Response: Same as above
Note: Redundant - can pass environment_id in body to resolve endpoint
```

---

## 🔍 **API Analysis & Recommendations**

### Essential APIs (Keep - 12 endpoints)

1. ✅ **POST** `/environments` - Create Environment
2. ✅ **GET** `/environments` - List Environments
3. ✅ **GET** `/environments/{id}` - Get Environment
4. ✅ **PUT** `/environments/{id}` - Update Environment
5. ✅ **POST** `/environments/{id}/activate` - Activate Environment
6. ✅ **DELETE** `/environments/{id}` - Delete Environment
7. ✅ **POST** `/environments/{id}/variables` - Create Variable
8. ✅ **GET** `/environments/{id}/variables` - List Variables
9. ✅ **PUT** `/environments/{id}/variables/{vid}` - Update Variable
10. ✅ **DELETE** `/environments/{id}/variables/{vid}` - Delete Variable
11. ✅ **GET** `/environments/active/variables` - Get Active Variables
12. ✅ **POST** `/environments/resolve` - Resolve Variables

### Optional APIs (Consider Removing - 3 endpoints)

1. ❓ **GET** `/environments/{id}/variables/{vid}` - Get Single Variable
   - _Can use list variables instead_
2. ❓ **GET** `/environments/{id}/variables/resolved` - Get Resolved Variables
   - _Redundant with active variables endpoint_
3. ❓ **POST** `/environments/{id}/resolve` - Resolve with Specific Environment
   - _Redundant - can pass environment_id in body_

### Current Status

**✅ Template endpoint removed** - Reduced from 16 to 15 endpoints total (12 essential + 3 optional)

---

## 🚨 **Error Handling**

All endpoints return consistent error responses:

```typescript
{
  "success": false,
  "status_code": 400|206|404|500,
  "error_message": "Descriptive error message"
}
```

Common error codes:

- `400` - Bad request (validation errors, duplicates)
- `206` - Partial content (workspace not found/access denied)
- `404` - Resource not found
- `500` - Internal server error

---

## 💡 **Usage Examples**

### Typical Workflow:

1. **Create Environment**: POST `/environments`
2. **Add Variables**: POST `/environments/{id}/variables`
3. **Activate Environment**: POST `/environments/{id}/activate`
4. **Resolve API Request**: POST `/environments/resolve`

### Variable Resolution Example:

```javascript
// Original API request template
const apiRequest = `
POST {{API_URL}}/users
Authorization: Bearer {{AUTH_TOKEN}}
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}
`;

// After resolution
const resolvedRequest = `
POST http://localhost:8000/users
Authorization: Bearer secret_token_123
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}
`;
```

---

## 🔧 **Implementation Notes**

- Variables use `{{variable_name}}` syntax (same as Postman)
- Only one environment can be active per workspace
- Secret variables are masked in responses but resolved with actual values
- Variable resolution supports nested variables
- Database transactions ensure consistency during operations
- All operations are scoped to workspace and user permissions

---

## 📝 **Changes from Original Implementation**

1. **Response Format**: All APIs now use standardized `{success, status_code, data, error_message}` format
2. **Error Handling**: Replaced HTTPException with create_response pattern
3. **Import Updates**: Updated imports to use relative paths and ExceptionHandler
4. **Secret Masking**: Consistent "\*\*\*" masking for secret variables in responses
5. **Database Transactions**: Proper rollback handling on errors
6. **Status Codes**: Updated some error codes (e.g., 206 for workspace access denied)
