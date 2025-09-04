# schemas.py
from pydantic import BaseModel, Field, validator, EmailStr
from typing import Optional, Dict, Any


class PaginationRes(BaseModel):
    page: int
    rows: int
    total_rows: int

    class Config:
        from_attributes = True

# Pydantic models for request/response
class UserSignUp(BaseModel):
    email: EmailStr
    password: str

class UserSignIn(BaseModel):
    email: str
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    god: bool
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class MessageResponse(BaseModel):
    message: str


# Forget Password Schemas
class ForgetPasswordRequest(BaseModel):
    email: EmailStr

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")
    new_password: str = Field(..., min_length=8, description="New password (minimum 8 characters)")

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Any


# Request schemas
class WorkspaceCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Workspace name")
    description: Optional[str] = Field(None, max_length=1000, description="Workspace description")

    @validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('Workspace name cannot be empty')
        return v.strip()


class WorkspaceUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Updated workspace name")
    description: Optional[str] = Field(None, max_length=1000, description="Updated workspace description")

    @validator('name', pre=True, always=True)
    def validate_name(cls, v):
        if v is not None:
            if not v or not v.strip():
                raise ValueError('Workspace name cannot be empty')
            return v.strip()
        return v


# Response schemas
class NodeResponse(BaseModel):
    id: int
    name: str
    type: str  # 'folder' or 'file'
    parent_id: Optional[int] = None
    created_at: Any
    children: List['NodeResponse'] = []

    class Config:
        from_attributes = True


# Enable forward reference
NodeResponse.model_rebuild()


class WorkspaceResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: Any
    user_id: Optional[int] = None

    class Config:
        from_attributes = True


class WorkspaceWithTreeResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: Any
    file_tree: List[NodeResponse] = []
    total_nodes: int = 0

    class Config:
        from_attributes = True


class WorkspaceListResponse(BaseModel):
    workspaces: List[WorkspaceResponse]

    class Config:
        from_attributes = True


# Base response wrapper (if you're using a standard response format)
class ApiResponse(BaseModel):
    response_code: int
    data: Optional[Any] = None
    message: Optional[str] = None
    error_message: Optional[str] = None


# file/folder

# Node Management Schemas - Add these to your existing schemas.py

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Any, Literal


# Node Request Schemas
class NodeCreateRequest(BaseModel):
    workspace_id: int = Field(..., description="ID of the workspace")
    name: str = Field(..., min_length=1, max_length=255, description="Node name")
    type: Literal["folder", "file"] = Field(..., description="Node type: 'folder' or 'file'")
    parent_id: Optional[int] = Field(None, description="Parent node ID (null for root level)")

    @validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('Node name cannot be empty')
        # Remove invalid characters for file/folder names
        invalid_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*']
        for char in invalid_chars:
            if char in v:
                raise ValueError(f'Node name cannot contain: {char}')
        return v.strip()


class NodeUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Updated node name")
    parent_id: Optional[int] = Field(None, description="New parent node ID (for moving)")

    @validator('name', pre=True, always=True)
    def validate_name(cls, v):
        if v is not None:
            if not v or not v.strip():
                raise ValueError('Node name cannot be empty')
            # Remove invalid characters for file/folder names
            invalid_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*']
            for char in invalid_chars:
                if char in v:
                    raise ValueError(f'Node name cannot contain: {char}')
            return v.strip()
        return v


# Node Response Schemas
class NodeDetailResponse(BaseModel):
    id: int
    workspace_id: int
    name: str
    type: str
    parent_id: Optional[int] = None
    created_at: Any
    children: List['NodeDetailResponse'] = []

    class Config:
        from_attributes = True


class NodeBasicResponse(BaseModel):
    id: int
    workspace_id: int
    name: str
    type: str
    parent_id: Optional[int] = None
    created_at: Any

    class Config:
        from_attributes = True


class NodeWithChildrenResponse(BaseModel):
    id: int
    workspace_id: int
    name: str
    type: str
    parent_id: Optional[int] = None
    created_at: Any
    children: List[NodeBasicResponse] = []
    children_count: int = 0

    class Config:
        from_attributes = True


# Enable forward references
NodeDetailResponse.model_rebuild()


# Path/Breadcrumb Response
class NodePathResponse(BaseModel):
    id: int
    name: str
    type: str

    class Config:
        from_attributes = True


class NodeWithPathResponse(BaseModel):
    id: int
    workspace_id: int
    name: str
    type: str
    parent_id: Optional[int] = None
    created_at: Any
    path: List[NodePathResponse] = []  # Breadcrumb path from root to current node
    children: List[NodeBasicResponse] = []

    class Config:
        from_attributes = True


# Header Management Schemas - Add these to your existing schemas.py

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Any, Dict


# ===========================================
# HEADER MANAGEMENT SCHEMAS
# ===========================================

class HeaderCreateRequest(BaseModel):
    content: Dict[str, Any] = Field(..., description="Header content as JSON object")
    @validator('content')
    def validate_content(cls, v):
        if not v:
            raise ValueError('Header content cannot be empty')
        # Basic validation for header structure
        if not isinstance(v, dict):
            raise ValueError('Header content must be a JSON object')
        return v


class HeaderUpdateRequest(BaseModel):
    content: Dict[str, Any] = Field(..., description="Updated header content as JSON object")

    @validator('content')
    def validate_content(cls, v):
        if not v:
            raise ValueError('Header content cannot be empty')

        if not isinstance(v, dict):
            raise ValueError('Header content must be a JSON object')

        return v


class HeaderResponse(BaseModel):
    id: int
    folder_id: int
    content: Dict[str, Any]
    created_at: Any

    class Config:
        from_attributes = True


class HeaderListResponse(BaseModel):
    headers: List[HeaderResponse]
    total_count: int = 0
    folder_info: Dict[str, Any] = {}

    class Config:
        from_attributes = True


class FolderHeadersSummaryResponse(BaseModel):
    folder_id: int
    folder_name: str
    workspace_id: int
    headers_count: int
    headers: List[HeaderResponse] = []

    class Config:
        from_attributes = True


# Common header templates/examples that you might want to use
class CommonHeaderTemplates(BaseModel):
    """Common header templates for API testing"""

    @staticmethod
    def get_auth_bearer_template():
        return {
            "Authorization": "Bearer {{token}}",
            "Content-Type": "application/json"
        }

    @staticmethod
    def get_basic_auth_template():
        return {
            "Authorization": "Basic {{credentials}}",
            "Content-Type": "application/json"
        }

    @staticmethod
    def get_api_key_template():
        return {
            "X-API-Key": "{{api_key}}",
            "Content-Type": "application/json"
        }

    @staticmethod
    def get_json_template():
        return {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    @staticmethod
    def get_form_template():
        return {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json"
        }


# Header validation helpers
class HeaderValidationHelper:
    """Helper class for header validation"""

    @staticmethod
    def validate_http_headers(headers: Dict[str, Any]) -> List[str]:
        """Validate HTTP headers and return list of warnings/errors"""
        warnings = []

        for key, value in headers.items():
            # Check for valid header names (basic validation)
            if not isinstance(key, str) or not key.strip():
                warnings.append(f"Invalid header name: {key}")
                continue

            # Check for common header name patterns
            if ' ' in key:
                warnings.append(f"Header name contains spaces: {key}")

            # Check for valid header values
            if not isinstance(value, (str, int, float, bool)):
                warnings.append(f"Invalid header value type for {key}: {type(value)}")

        return warnings

    @staticmethod
    def normalize_headers(headers: Dict[str, Any]) -> Dict[str, str]:
        """Normalize headers to string values"""
        normalized = {}
        for key, value in headers.items():
            if isinstance(key, str) and key.strip():
                normalized[key.strip()] = str(value) if value is not None else ""
        return normalized


# Header search and filter schemas
class HeaderSearchRequest(BaseModel):
    query: Optional[str] = Field(None, min_length=1, max_length=100, description="Search query for header content")
    header_name: Optional[str] = Field(None, description="Filter by specific header name")

    class Config:
        from_attributes = True


# Add these schemas to your existing schemas.py

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


# ===========================================
# HEADER INHERITANCE SCHEMAS
# ===========================================

class FolderInPath(BaseModel):
    id: int
    name: str
    has_headers: bool

    class Config:
        from_attributes = True


class HeaderContribution(BaseModel):
    key: str
    value: Any

    class Config:
        from_attributes = True


class HeaderOverride(BaseModel):
    key: str
    old_value: Any
    new_value: Any

    class Config:
        from_attributes = True


class FolderHeaderContribution(BaseModel):
    folder_id: int
    folder_name: str
    headers_added: List[HeaderContribution] = []
    headers_overridden: List[HeaderOverride] = []

    class Config:
        from_attributes = True


class CompleteHeadersResponse(BaseModel):
    folder_id: int
    folder_name: str
    workspace_id: int
    complete_headers: Dict[str, Any]
    headers_count: int
    inheritance_path: List[FolderInPath]
    folders_with_headers: int
    inheritance_details: Optional[List[FolderHeaderContribution]] = None
    raw_headers_by_folder: Optional[Dict[str, Dict[str, Any]]] = None

    class Config:
        from_attributes = True


class FolderHeaderPreview(BaseModel):
    level: int
    folder_id: int
    folder_name: str
    has_headers: bool
    headers: Dict[str, Any] = {}
    headers_count: int = 0
    header_id: Optional[int] = None
    created_at: Optional[Any] = None

    class Config:
        from_attributes = True


class HeaderInheritancePreviewResponse(BaseModel):
    target_folder_id: int
    target_folder_name: str
    inheritance_path: List[FolderHeaderPreview]
    total_levels: int
    folders_with_headers: int

    class Config:
        from_attributes = True



# Pydantic schemas for API management
class ApiCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="API name")
    method: str = Field(..., description="HTTP method (GET, POST, PUT, DELETE, PATCH)")
    endpoint: str = Field(..., description="API endpoint path")
    description: Optional[str] = Field(None, description="API description")
    is_active: bool = Field(True, description="API active status")
    extra_meta: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")

    @validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('API name cannot be empty')
        return v.strip()

    @validator('endpoint')
    def validate_endpoint(cls, v):
        if not v or not v.strip():
            raise ValueError('Endpoint cannot be empty')

        endpoint = v.strip()

        # Check if endpoint already has a protocol
        if not (endpoint.startswith('http://') or endpoint.startswith('https://')):
            # If no protocol, add https:// as default
            endpoint = 'https://' + endpoint

        return endpoint


class ApiUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="API name")
    method: Optional[str] = Field(None, description="HTTP method")
    endpoint: Optional[str] = Field(None, description="API endpoint path")
    description: Optional[str] = Field(None, description="API description")
    is_active: Optional[bool] = Field(None, description="API active status")
    headers: Optional[Dict[str, Any]] = Field(None, description="API request headers")
    body: Optional[Dict[str, Any]] = Field(None, description="API request body")
    params: Optional[Dict[str, Any]] = Field(None, description="API request parameters")
    extra_meta: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


    @validator('name', pre=True, always=True)
    def validate_name(cls, v):
        if v is not None:
            if not v or not v.strip():
                raise ValueError('API name cannot be empty')
            return v.strip()
        return v

    @validator('endpoint', pre=True, always=True)
    def validate_endpoint(cls, v):
        if v is not None:
            if not v or not v.strip():
                raise ValueError('Endpoint cannot be empty')

            endpoint = v.strip()

            # Check if endpoint already has a protocol
            if not (endpoint.startswith('http://') or endpoint.startswith('https://')):
                # If no protocol, add https:// as default
                endpoint = 'https://' + endpoint

            return endpoint
        return v


# Pydantic schemas for API cases
class ApiCaseCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Test case name")
    headers: Optional[Dict[str, Any]] = Field(None, description="Request headers")
    body: Optional[Dict[str, Any]] = Field(None, description="Request body data")
    params: Optional[Dict[str, Any]] = Field(None, description="Request query/path parameters")
    expected: Optional[Dict[str, Any]] = Field(None, description="Expected response data")

    @validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('Test case name cannot be empty')
        return v.strip()


class ApiCaseUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Test case name")
    headers: Optional[Dict[str, Any]] = Field(None, description="Request headers")
    body: Optional[Dict[str, Any]] = Field(None, description="Request body data")
    params: Optional[Dict[str, Any]] = Field(None, description="Request query/path parameters")
    expected: Optional[Dict[str, Any]] = Field(None, description="Expected response data")
    response: Optional[Dict[str, Any]] = Field(None, description="Expected response data")

    @validator('name', pre=True, always=True)
    def validate_name(cls, v):
        if v is not None:
            if not v or not v.strip():
                raise ValueError('Test case name cannot be empty')
            return v.strip()
        return v

class UpdateTestCaseRequest(BaseModel):
    name: Optional[str] = None
    headers: Optional[Dict[Any, Any]] = None  # Added headers
    body: Optional[Dict[Any, Any]] = None
    params: Optional[Dict[Any, Any]] = None
    expected: Optional[Dict[Any, Any]] = None



class Send_OTP_Request(BaseModel):
    user: str
    use_for: Literal['login', 'password_reset']


class ChangePassword(BaseModel):
    old_password: str
    new_password: str
    new_password_again: str

    @validator("new_password", "new_password_again", pre=True, always=True)
    def validate_password(cls, value):
        """Ensure password is not empty and has a minimum length of 6 characters."""
        if not value or not value.strip():
            raise ValueError("Password cannot be empty or just spaces.")
        if len(value) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return value.strip()


class ForgotPassword(BaseModel):
    otp: int
    email: EmailStr
    new_password: str
    new_password_again: str

    @validator("new_password", "new_password_again", pre=True, always=True)
    def validate_password(cls, value):
        """Ensure password is not empty and has a minimum length of 6 characters."""
        if not value or not value.strip():
            raise ValueError("Password cannot be empty or just spaces.")
        if len(value) < 6:
            raise ValueError("Password must be at least 6 characters long.")
        return value.strip()


# ===========================================
# ENVIRONMENT MANAGEMENT SCHEMAS
# ===========================================

class EnvironmentVariableData(BaseModel):
    """Individual variable data structure for JSON storage"""
    value: Optional[str] = Field(None, description="Variable value")
    description: Optional[str] = Field(None, max_length=500, description="Variable description")
    is_enabled: bool = Field(True, description="Whether variable is enabled")
    is_secret: bool = Field(False, description="Whether variable value should be hidden")

    class Config:
        from_attributes = True


class EnvironmentVariableCreate(BaseModel):
    """Schema for creating individual environment variables"""
    key: str = Field(..., min_length=1, max_length=255, description="Variable key/name")
    value: Optional[str] = Field(None, description="Variable value")
    description: Optional[str] = Field(None, max_length=500, description="Variable description")
    is_enabled: bool = Field(True, description="Whether variable is enabled")
    is_secret: bool = Field(False, description="Whether variable value should be hidden")

    class Config:
        from_attributes = True


class EnvironmentVariableUpdate(BaseModel):
    """Schema for updating individual environment variables"""
    key: Optional[str] = Field(None, min_length=1, max_length=255, description="Variable key/name")
    value: Optional[str] = Field(None, description="Variable value")
    description: Optional[str] = Field(None, max_length=500, description="Variable description")
    is_enabled: Optional[bool] = Field(None, description="Whether variable is enabled")
    is_secret: Optional[bool] = Field(None, description="Whether variable value should be hidden")

    class Config:
        from_attributes = True


class EnvironmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Environment name")
    description: Optional[str] = Field(None, max_length=1000, description="Environment description")
    is_active: bool = Field(False, description="Whether this is the active environment")
    variables: Optional[Dict[str, EnvironmentVariableData]] = Field({}, description="Environment variables as key-value pairs")

    @validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('Environment name cannot be empty')
        return v.strip()

    @validator('variables', pre=True, always=True)
    def validate_variables(cls, v):
        if v is None:
            return {}
        if isinstance(v, list):
            # Convert old format (list of objects) to new format (dict)
            result = {}
            for item in v:
                if hasattr(item, 'key'):
                    key = item.key
                    result[key] = EnvironmentVariableData(
                        value=getattr(item, 'value', None),
                        description=getattr(item, 'description', None),
                        is_enabled=getattr(item, 'is_enabled', True),
                        is_secret=getattr(item, 'is_secret', False)
                    )
            return result
        return v


class EnvironmentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Environment name")
    description: Optional[str] = Field(None, max_length=1000, description="Environment description")
    is_active: Optional[bool] = Field(None, description="Whether this is the active environment")
    variables: Optional[Dict[str, EnvironmentVariableData]] = Field(None, description="Environment variables as key-value pairs")

    @validator('name', pre=True, always=True)
    def validate_name(cls, v):
        if v is not None:
            if not v or not v.strip():
                raise ValueError('Environment name cannot be empty')
            return v.strip()
        return v


class EnvironmentResponse(BaseModel):
    id: int
    workspace_id: int
    name: str
    description: Optional[str] = None
    is_active: bool
    variables: Optional[Dict[str, Any]] = {}
    created_at: Any
    updated_at: Any

    class Config:
        from_attributes = True

    @validator('variables', pre=True, always=True)
    def mask_secret_variables(cls, v):
        """Mask secret values in response"""
        if not v:
            return {}

        masked_vars = {}
        for key, var_data in v.items():
            if isinstance(var_data, dict):
                masked_data = var_data.copy()
                if var_data.get('is_secret', False) and var_data.get('value'):
                    masked_data['value'] = "***"
                masked_vars[key] = masked_data
            else:
                masked_vars[key] = var_data
        return masked_vars


class EnvironmentListResponse(BaseModel):
    environments: List[EnvironmentResponse]
    total_count: int = 0
    active_environment: Optional[EnvironmentResponse] = None

    class Config:
        from_attributes = True


# Environment Variable Resolution for API Testing
class ResolvedVariables(BaseModel):
    """Variables resolved from active environment for API testing"""
    variables: Dict[str, str] = Field({}, description="Resolved key-value pairs")
    environment_name: Optional[str] = Field(None, description="Source environment name")
    environment_id: Optional[int] = Field(None, description="Source environment ID")
    resolved_count: int = Field(0, description="Number of variables resolved")

    class Config:
        from_attributes = True


class VariableResolutionRequest(BaseModel):
    """Request schema for resolving variables in text"""
    text: str = Field(..., description="Text containing variables to resolve (e.g., '{{API_KEY}}')")
    environment_id: Optional[int] = Field(None, description="Specific environment ID (uses active if not provided)")

    class Config:
        from_attributes = True


class VariableResolutionResponse(BaseModel):
    """Response schema for variable resolution"""
    original_text: str = Field(..., description="Original text with variables")
    resolved_text: str = Field(..., description="Text with variables resolved")
    variables_found: List[str] = Field([], description="List of variable keys found in text")
    variables_resolved: List[str] = Field([], description="List of variable keys successfully resolved")
    variables_missing: List[str] = Field([], description="List of variable keys not found in environment")
    environment_used: Optional[str] = Field(None, description="Environment name used for resolution")

    class Config:
        from_attributes = True
