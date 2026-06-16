"""
What this file does: Defines all Pydantic request and response schemas used across the API.
"""

from datetime import datetime
from pydantic import BaseModel, Field, validator, EmailStr, root_validator
from typing import Optional, List, Dict, Any, Literal, Union


class PaginationRes(BaseModel):
    """Carry pagination metadata alongside a paginated response.

    Attributes:
        page: Current page number (1-indexed).
        rows: Number of items on the current page.
        total_rows: Total number of items across all pages.
    """

    page: int
    rows: int
    total_rows: int

    class Config:
        from_attributes = True


class UserSignUp(BaseModel):
    """Carry credentials for a new user registration request.

    Attributes:
        email: Valid email address used as the login identifier.
        password: Plain-text password; hashed server-side before storage.
    """

    email: EmailStr
    password: str


class UserSignIn(BaseModel):
    """Carry credentials for a login request.

    Attributes:
        email: Login email or username string.
        password: Plain-text password to verify.
    """

    email: str
    password: str


class UserUpdate(BaseModel):
    """Carry optional fields for updating a user's profile.

    Attributes:
        username: New display name; ``None`` leaves the current value unchanged.
        email: New email address; ``None`` leaves the current value unchanged.
    """

    username: Optional[str] = None
    email: Optional[EmailStr] = None


class UserResponse(BaseModel):
    """Represent a user's public profile data returned after authentication.

    Attributes:
        id: User primary key.
        username: Display name.
        email: Login email.
        god: ``True`` when the user has superuser privileges.
        created_at: Account creation timestamp as a string.
    """

    id: int
    username: str
    email: str
    god: bool
    created_at: str


class TokenResponse(BaseModel):
    """Carry a JWT access token and the authenticated user's profile.

    Attributes:
        access_token: Signed JWT string for use in subsequent requests.
        token_type: Token scheme — always ``"bearer"``.
        user: Profile of the authenticated user.
    """

    access_token: str
    token_type: str
    user: UserResponse


class MessageResponse(BaseModel):
    """Carry a plain human-readable message in a response body.

    Attributes:
        message: Descriptive text of the outcome.
    """

    message: str


class ForgetPasswordRequest(BaseModel):
    """Carry the email address for initiating a password reset flow.

    Attributes:
        email: Registered email to send the OTP to.
    """

    email: EmailStr


class VerifyOTPRequest(BaseModel):
    """Carry the email and OTP code for verifying a password reset attempt.

    Attributes:
        email: Email the OTP was sent to.
        otp_code: Exactly 6-digit OTP string.
    """

    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")


class ResetPasswordRequest(BaseModel):
    """Carry the credentials required to complete a password reset.

    Attributes:
        email: Email address of the account being reset.
        otp_code: 6-digit OTP code from the reset email.
        new_password: Replacement password; minimum 8 characters.
    """

    email: EmailStr
    otp_code: str = Field(..., min_length=6, max_length=6, description="6-digit OTP code")
    new_password: str = Field(..., min_length=8, description="New password (minimum 8 characters)")


class WorkspaceCreateRequest(BaseModel):
    """Carry the name and optional description for creating a new workspace.

    Attributes:
        name: Workspace display name; 1–255 characters, leading/trailing whitespace stripped.
        description: Optional free-text description; ``None`` when not provided.
    """

    name: str = Field(..., min_length=1, max_length=255, description="Workspace name")
    description: Optional[str] = Field(None, max_length=1000, description="Workspace description")

    @validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('Workspace name cannot be empty')
        return v.strip()


class WorkspaceUpdateRequest(BaseModel):
    """Carry optional fields for updating an existing workspace.

    Attributes:
        name: New display name; ``None`` leaves the current value unchanged.
        description: New description; ``None`` leaves the current value unchanged.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Updated workspace name")
    description: Optional[str] = Field(None, max_length=1000, description="Updated workspace description")

    @validator('name', pre=True, always=True)
    def validate_name(cls, v):
        if v is not None:
            if not v or not v.strip():
                raise ValueError('Workspace name cannot be empty')
            return v.strip()
        return v


class NodeResponse(BaseModel):
    """Represent a single folder or file node in a workspace tree response.

    Attributes:
        id: Node primary key.
        name: Node display name.
        type: ``"folder"`` or ``"file"``.
        parent_id: Parent folder id; ``None`` for root-level nodes.
        created_at: Creation timestamp.
        children: Nested child nodes; empty list when the node has no children.
    """

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
    """Represent a workspace summary without its file tree.

    Attributes:
        id: Workspace primary key.
        name: Display name.
        description: Optional description; ``None`` when not set.
        created_at: Creation timestamp.
        user_id: Owner's user id; ``None`` when not included in the response.
    """

    id: int
    name: str
    description: Optional[str] = None
    created_at: Any
    user_id: Optional[int] = None

    class Config:
        from_attributes = True


class WorkspaceWithTreeResponse(BaseModel):
    """Represent a workspace together with its full hierarchical file tree.

    Attributes:
        id: Workspace primary key.
        name: Display name.
        description: Optional description; ``None`` when not set.
        created_at: Creation timestamp.
        file_tree: Hierarchical list of root NodeResponse items.
        total_nodes: Total count of all nodes (folders + files) in the workspace.
    """

    id: int
    name: str
    description: Optional[str] = None
    created_at: Any
    file_tree: List[NodeResponse] = []
    total_nodes: int = 0

    class Config:
        from_attributes = True


class WorkspaceListResponse(BaseModel):
    """Carry a list of workspace summaries.

    Attributes:
        workspaces: List of WorkspaceResponse items.
    """

    workspaces: List[WorkspaceResponse]

    class Config:
        from_attributes = True


class ApiResponse(BaseModel):
    """Wrap any API response in a standard envelope with status and optional payload.

    Attributes:
        response_code: HTTP-equivalent status code.
        data: Response payload; ``None`` when the response carries no data.
        message: Human-readable success message; ``None`` when not applicable.
        error_message: Human-readable error description; ``None`` on success.
    """

    response_code: int
    data: Optional[Any] = None
    message: Optional[str] = None
    error_message: Optional[str] = None


class NodeCreateRequest(BaseModel):
    """Carry the fields required to create a new folder or file node.

    Attributes:
        workspace_id: Target workspace for the new node.
        name: Node display name; 1–255 characters, invalid filesystem characters rejected.
        type: ``"folder"`` creates a directory node; ``"file"`` creates an API container node.
        parent_id: Parent folder id; ``None`` creates the node at the workspace root.
    """

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
    """Carry optional fields for renaming or moving a node.

    Attributes:
        name: New display name; ``None`` leaves the current name unchanged.
        parent_id: New parent folder id for moving; ``None`` leaves the current parent unchanged.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Updated node name")
    parent_id: Optional[int] = Field(None, description="New parent node ID (for moving)")

    @validator('name', pre=True, always=True)
    def validate_name(cls, v):
        if v is not None:
            if not v or not v.strip():
                raise ValueError('Node name cannot be empty')
            invalid_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*']
            for char in invalid_chars:
                if char in v:
                    raise ValueError(f'Node name cannot contain: {char}')
            return v.strip()
        return v


class NodeDetailResponse(BaseModel):
    """Represent a node with workspace context and nested children.

    Attributes:
        id: Node primary key.
        workspace_id: Owning workspace id.
        name: Display name.
        type: ``"folder"`` or ``"file"``.
        parent_id: Parent folder id; ``None`` for root nodes.
        created_at: Creation timestamp.
        children: Nested child NodeDetailResponse items; empty list when none.
    """

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
    """Represent a node's core fields without children.

    Attributes:
        id: Node primary key.
        workspace_id: Owning workspace id.
        name: Display name.
        type: ``"folder"`` or ``"file"``.
        parent_id: Parent folder id; ``None`` for root nodes.
        created_at: Creation timestamp.
    """

    id: int
    workspace_id: int
    name: str
    type: str
    parent_id: Optional[int] = None
    created_at: Any

    class Config:
        from_attributes = True


class NodeWithChildrenResponse(BaseModel):
    """Represent a node with a flat list of its immediate children.

    Attributes:
        id: Node primary key.
        workspace_id: Owning workspace id.
        name: Display name.
        type: ``"folder"`` or ``"file"``.
        parent_id: Parent folder id; ``None`` for root nodes.
        created_at: Creation timestamp.
        children: Immediate child nodes (not recursively nested); empty list when none.
        children_count: Count of immediate children.
    """

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


class NodePathResponse(BaseModel):
    """Represent a single step in a breadcrumb path from root to a node.

    Attributes:
        id: Node primary key.
        name: Display name at this path step.
        type: ``"folder"`` or ``"file"``.
    """

    id: int
    name: str
    type: str

    class Config:
        from_attributes = True


class NodeWithPathResponse(BaseModel):
    """Represent a node together with its full breadcrumb path and immediate children.

    Attributes:
        id: Node primary key.
        workspace_id: Owning workspace id.
        name: Display name.
        type: ``"folder"`` or ``"file"``.
        parent_id: Parent folder id; ``None`` for root nodes.
        created_at: Creation timestamp.
        path: Ordered list from root to this node.
        children: Immediate child nodes; empty list when none.
    """

    id: int
    workspace_id: int
    name: str
    type: str
    parent_id: Optional[int] = None
    created_at: Any
    path: List[NodePathResponse] = []
    children: List[NodeBasicResponse] = []

    class Config:
        from_attributes = True


class HeaderCreateRequest(BaseModel):
    """Carry a JSON dict of HTTP headers to attach to a folder node.

    Attributes:
        content: Non-empty JSON object mapping header names to values.
    """

    content: Dict[str, Any] = Field(..., description="Header content as JSON object")

    @validator('content')
    def validate_content(cls, v):
        if not v:
            raise ValueError('Header content cannot be empty')
        if not isinstance(v, dict):
            raise ValueError('Header content must be a JSON object')
        return v


class HeaderUpdateRequest(BaseModel):
    """Carry a replacement JSON dict of HTTP headers for updating a folder's header set.

    Attributes:
        content: Non-empty JSON object mapping header names to values.
    """

    content: Dict[str, Any] = Field(..., description="Updated header content as JSON object")

    @validator('content')
    def validate_content(cls, v):
        if not v:
            raise ValueError('Header content cannot be empty')
        if not isinstance(v, dict):
            raise ValueError('Header content must be a JSON object')
        return v


class HeaderResponse(BaseModel):
    """Represent a single folder's header record.

    Attributes:
        id: Header record primary key.
        folder_id: Node id of the folder this header set belongs to.
        content: JSON dict of header key→value pairs.
        created_at: Creation timestamp.
    """

    id: int
    folder_id: int
    content: Dict[str, Any]
    created_at: Any

    class Config:
        from_attributes = True


class HeaderListResponse(BaseModel):
    """Carry a list of header records with folder context.

    Attributes:
        headers: List of HeaderResponse items.
        total_count: Total number of header records in the list.
        folder_info: Dict containing folder metadata; empty dict when not provided.
    """

    headers: List[HeaderResponse]
    total_count: int = 0
    folder_info: Dict[str, Any] = {}

    class Config:
        from_attributes = True


class FolderHeadersSummaryResponse(BaseModel):
    """Summarise the headers defined directly on a single folder node.

    Attributes:
        folder_id: Node id of the folder.
        folder_name: Display name of the folder.
        workspace_id: Owning workspace id.
        headers_count: Number of header key-value pairs on this folder.
        headers: List of HeaderResponse items; empty list when no headers are set.
    """

    folder_id: int
    folder_name: str
    workspace_id: int
    headers_count: int
    headers: List[HeaderResponse] = []

    class Config:
        from_attributes = True


class CommonHeaderTemplates(BaseModel):
    """Provide static helper methods for common HTTP header template dicts."""

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


class HeaderValidationHelper:
    """Provide static methods for validating and normalising HTTP header dicts."""

    @staticmethod
    def validate_http_headers(headers: Dict[str, Any]) -> List[str]:
        """Validate HTTP headers and return list of warnings/errors."""
        warnings = []

        for key, value in headers.items():
            if not isinstance(key, str) or not key.strip():
                warnings.append(f"Invalid header name: {key}")
                continue

            if ' ' in key:
                warnings.append(f"Header name contains spaces: {key}")

            if not isinstance(value, (str, int, float, bool)):
                warnings.append(f"Invalid header value type for {key}: {type(value)}")

        return warnings

    @staticmethod
    def normalize_headers(headers: Dict[str, Any]) -> Dict[str, str]:
        """Normalize headers to string values."""
        normalized = {}
        for key, value in headers.items():
            if isinstance(key, str) and key.strip():
                normalized[key.strip()] = str(value) if value is not None else ""
        return normalized


class HeaderSearchRequest(BaseModel):
    """Carry optional filters for searching header records.

    Attributes:
        query: Free-text search string; ``None`` returns all headers.
        header_name: Filter by a specific header key name; ``None`` disables this filter.
    """

    query: Optional[str] = Field(None, min_length=1, max_length=100, description="Search query for header content")
    header_name: Optional[str] = Field(None, description="Filter by specific header name")

    class Config:
        from_attributes = True


class FolderInPath(BaseModel):
    """Represent a single folder entry in a header inheritance path.

    Attributes:
        id: Folder node primary key.
        name: Folder display name.
        has_headers: ``True`` when this folder has headers defined; ``False`` otherwise.
    """

    id: int
    name: str
    has_headers: bool

    class Config:
        from_attributes = True


class HeaderContribution(BaseModel):
    """Represent a single header key-value pair contributed by a folder.

    Attributes:
        key: Header name.
        value: Header value.
    """

    key: str
    value: Any

    class Config:
        from_attributes = True


class HeaderOverride(BaseModel):
    """Represent a header key whose value was overridden by a child folder.

    Attributes:
        key: Header name that was overridden.
        old_value: Value from the parent folder.
        new_value: Value from the child folder that replaced it.
    """

    key: str
    old_value: Any
    new_value: Any

    class Config:
        from_attributes = True


class FolderHeaderContribution(BaseModel):
    """Describe the headers a single folder added or overrode in an inheritance chain.

    Attributes:
        folder_id: Node id of the contributing folder.
        folder_name: Display name of the folder.
        headers_added: New headers introduced by this folder; empty list when none.
        headers_overridden: Headers this folder replaced from a parent; empty list when none.
    """

    folder_id: int
    folder_name: str
    headers_added: List[HeaderContribution] = []
    headers_overridden: List[HeaderOverride] = []

    class Config:
        from_attributes = True


class CompleteHeadersResponse(BaseModel):
    """Carry the merged set of inherited headers for a folder, with full provenance detail.

    Attributes:
        folder_id: Target folder node id.
        folder_name: Target folder display name.
        workspace_id: Owning workspace id.
        complete_headers: Final merged header dict after all inheritance is applied.
        headers_count: Number of keys in complete_headers.
        inheritance_path: Ordered list of folders from root to target.
        folders_with_headers: Count of folders in the path that have headers defined.
        inheritance_details: Per-folder breakdown of which keys were added or overridden;
                             ``None`` when detail was not requested.
        raw_headers_by_folder: Unmerged header dict keyed by folder id string;
                               ``None`` when not requested.
    """

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
    """Represent one level of a folder hierarchy for header inheritance preview.

    Attributes:
        level: Depth level in the folder tree (0 = root).
        folder_id: Node id of this folder.
        folder_name: Display name.
        has_headers: ``True`` when this folder has headers defined.
        headers: Header dict for this folder; empty dict when none.
        headers_count: Number of header keys on this folder.
        header_id: Primary key of the Header record; ``None`` when no headers are set.
        created_at: Header creation timestamp; ``None`` when no headers are set.
    """

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
    """Carry a preview of header inheritance across the ancestor chain of a folder.

    Attributes:
        target_folder_id: Node id of the folder being previewed.
        target_folder_name: Display name of the target folder.
        inheritance_path: Ordered list of FolderHeaderPreview items from root to target.
        total_levels: Number of levels in the inheritance path.
        folders_with_headers: Count of folders in the path that have headers defined.
    """

    target_folder_id: int
    target_folder_name: str
    inheritance_path: List[FolderHeaderPreview]
    total_levels: int
    folders_with_headers: int

    class Config:
        from_attributes = True


class ApiCreateRequest(BaseModel):
    """Carry the fields required to create a new API definition on a file node.

    Attributes:
        name: API display name; 1–255 characters.
        method: HTTP method string (e.g. ``"GET"``, ``"POST"``).
        endpoint: URL path template (e.g. ``"/api/v1/users/{id}"``).
        description: Optional documentation text; ``None`` when not provided.
        is_active: ``True`` includes the API in test runs; ``False`` excludes it.
        extra_meta: Optional JSON dict for additional metadata; ``None`` when not needed.
    """

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
        return endpoint


class ApiUpdateRequest(BaseModel):
    """Carry optional fields for updating an existing API definition.

    Attributes:
        name: New display name; ``None`` leaves current value unchanged.
        method: New HTTP method; ``None`` leaves current value unchanged.
        endpoint: New URL path template; ``None`` leaves current value unchanged.
        description: New documentation text; ``None`` leaves current value unchanged.
        is_active: New active flag; ``None`` leaves current value unchanged.
        headers: New request headers dict; ``None`` leaves current value unchanged.
        body: New request body dict; ``None`` leaves current value unchanged.
        params: New query parameters dict; ``None`` leaves current value unchanged.
        extra_meta: New metadata dict; ``None`` leaves current value unchanged.
    """

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
            return endpoint
        return v


class ApiCaseCreateRequest(BaseModel):
    """Carry the fields required to create a new test case for an API.

    Attributes:
        name: Test case display name; 1–255 characters.
        headers: Optional request headers dict; ``None`` uses no case-level headers.
        body: Optional request body dict; ``None`` sends no body.
        params: Optional query/path parameter dict; ``None`` sends no parameters.
        expected: Optional assertion criteria dict; ``None`` performs no assertions.
    """

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
    """Carry optional fields for updating an existing test case.

    Attributes:
        name: New display name; ``None`` leaves current value unchanged.
        headers: New headers dict; ``None`` leaves current value unchanged.
        body: New body dict; ``None`` leaves current value unchanged.
        params: New parameters dict; ``None`` leaves current value unchanged.
        expected: New assertion criteria; ``None`` leaves current value unchanged.
        response: Alternate field for expected response; ``None`` leaves current value unchanged.
    """

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
    """Carry optional fields for a partial test case update.

    Attributes:
        name: New display name; ``None`` leaves current value unchanged.
        headers: New headers dict; ``None`` leaves current value unchanged.
        body: New body dict; ``None`` leaves current value unchanged.
        params: New parameters dict; ``None`` leaves current value unchanged.
        expected: New assertion criteria; ``None`` leaves current value unchanged.
    """

    name: Optional[str] = None
    headers: Optional[Dict[Any, Any]] = None
    body: Optional[Dict[Any, Any]] = None
    params: Optional[Dict[Any, Any]] = None
    expected: Optional[Dict[Any, Any]] = None


class Send_OTP_Request(BaseModel):
    """Carry the user identifier and intended use case for OTP generation.

    Attributes:
        user: Username or email to send the OTP to.
        use_for: ``"login"`` generates an OTP for login verification;
                 ``"password_reset"`` → generates an OTP for a password reset flow.
    """

    user: str
    use_for: Literal['login', 'password_reset']


class ChangePassword(BaseModel):
    """Carry the current and new passwords for an authenticated password change.

    Attributes:
        old_password: Current password to verify before changing.
        new_password: Desired new password; minimum 6 characters.
        new_password_again: Confirmation of new_password; must match new_password.
    """

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
    """Carry the OTP and new password credentials to complete a forgot-password reset.

    Attributes:
        otp: Numeric OTP code from the reset email.
        email: Account email address being reset.
        new_password: Desired new password; minimum 6 characters.
        new_password_again: Confirmation of new_password.
    """

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


class EnvironmentVariableData(BaseModel):
    """Represent the stored data for a single environment variable.

    Attributes:
        value: Variable value string; ``None`` when the variable has no value set.
        description: Optional explanation; ``None`` when not provided.
        is_enabled: ``True`` when the variable is active and will be substituted;
                    ``False`` to disable without deleting.
    """

    value: Optional[str] = Field(None, description="Variable value")
    description: Optional[str] = Field(None, max_length=500, description="Variable description")
    is_enabled: bool = Field(True, description="Whether variable is enabled")

    class Config:
        from_attributes = True


class EnvironmentCreate(BaseModel):
    """Carry the fields required to create a new environment.

    Attributes:
        name: Environment display name; 1–255 characters.
        description: Optional description; ``None`` when not provided.
        is_active: ``True`` immediately activates this environment in the workspace.
        variables: Initial key→value variable pairs; empty dict when not provided.
    """

    name: str = Field(..., min_length=1, max_length=255, description="Environment name")
    description: Optional[str] = Field(None, max_length=1000, description="Environment description")
    is_active: bool = Field(False, description="Whether this is the active environment")
    variables: Optional[Dict[str, str]] = Field({}, description="Environment variables as simple key-value pairs")

    @validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('Environment name cannot be empty')
        return v.strip()


class EnvironmentUpdate(BaseModel):
    """Carry optional fields for updating an existing environment.

    Attributes:
        name: New display name; ``None`` leaves current value unchanged.
        description: New description; ``None`` leaves current value unchanged.
        is_active: New active flag; ``None`` leaves current value unchanged.
        variables: Replacement variable dict; ``None`` leaves current variables unchanged.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Environment name")
    description: Optional[str] = Field(None, max_length=1000, description="Environment description")
    is_active: Optional[bool] = Field(None, description="Whether this is the active environment")
    variables: Optional[Dict[str, str]] = Field(None, description="Environment variables as simple key-value pairs")

    @validator('name', pre=True, always=True)
    def validate_name(cls, v):
        if v is not None:
            if not v or not v.strip():
                raise ValueError('Environment name cannot be empty')
            return v.strip()
        return v


class EnvironmentResponse(BaseModel):
    """Represent a full environment record including its variables.

    Attributes:
        id: Primary key.
        workspace_id: Owning workspace id.
        name: Display name.
        description: Optional description; ``None`` when not set.
        is_active: ``True`` when this environment is currently active.
        variables: JSON dict of variable key→value pairs; empty dict when none defined.
        created_at: Creation timestamp.
        updated_at: Last modification timestamp.
    """

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


class VariablesSetRequest(BaseModel):
    """Carry a set of key-value pairs to create or replace environment variables.

    Attributes:
        variables: Non-empty dict mapping variable names to string values.
    """

    variables: Dict[str, str] = Field(..., description="Variables as simple key-value pairs")

    @validator('variables')
    def validate_variables(cls, v):
        if not v:
            raise ValueError('Variables cannot be empty')
        if not isinstance(v, dict):
            raise ValueError('Variables must be a JSON object')
        return v


class VariablesUpdateRequest(BaseModel):
    """Carry a set of key-value pairs to update existing environment variables.

    Attributes:
        variables: Non-empty dict mapping variable names to updated string values.
    """

    variables: Dict[str, str] = Field(..., description="Updated variables as simple key-value pairs")

    @validator('variables')
    def validate_variables(cls, v):
        if not v:
            raise ValueError('Variables cannot be empty')
        if not isinstance(v, dict):
            raise ValueError('Variables must be a JSON object')
        return v


class VariablesResponse(BaseModel):
    """Represent the current variable set for an environment.

    Attributes:
        environment_id: Primary key of the environment.
        environment_name: Display name of the environment.
        variables: Current key→value variable dict.
        created_at: Environment creation timestamp.
        updated_at: Last variable modification timestamp.
    """

    environment_id: int
    environment_name: str
    variables: Dict[str, Any]
    created_at: Any
    updated_at: Any

    class Config:
        from_attributes = True


class EnvironmentListResponse(BaseModel):
    """Carry a list of environments with the active one highlighted.

    Attributes:
        environments: All environments for the workspace.
        total_count: Total number of environments.
        active_environment: The currently active environment; ``None`` when none is active.
    """

    environments: List[EnvironmentResponse]
    total_count: int = 0
    active_environment: Optional[EnvironmentResponse] = None

    class Config:
        from_attributes = True


class ResolvedVariables(BaseModel):
    """Carry the resolved variable set from the active environment for test execution.

    Attributes:
        variables: Dict of resolved key→value pairs ready for substitution.
        environment_name: Name of the environment that provided the variables; ``None`` when no environment is active.
        environment_id: Primary key of the source environment; ``None`` when no environment is active.
        resolved_count: Number of variables successfully resolved.
    """

    variables: Dict[str, str] = Field({}, description="Resolved key-value pairs")
    environment_name: Optional[str] = Field(None, description="Source environment name")
    environment_id: Optional[int] = Field(None, description="Source environment ID")
    resolved_count: int = Field(0, description="Number of variables resolved")

    class Config:
        from_attributes = True


class VariableResolutionRequest(BaseModel):
    """Carry a template text and optional environment id for variable substitution.

    Attributes:
        text: Text containing ``{{VAR_NAME}}`` placeholders to resolve.
        environment_id: Specific environment to use; ``None`` uses the workspace's active environment.
    """

    text: str = Field(..., description="Text containing variables to resolve (e.g., '{{API_KEY}}')")
    environment_id: Optional[int] = Field(None, description="Specific environment ID (uses active if not provided)")

    class Config:
        from_attributes = True


class VariableResolutionResponse(BaseModel):
    """Carry the result of resolving ``{{VAR}}`` placeholders in a text string.

    Attributes:
        original_text: Input text before substitution.
        resolved_text: Text after all known variables have been substituted.
        variables_found: All variable keys detected in the original text.
        variables_resolved: Keys that were successfully substituted.
        variables_missing: Keys that were found but had no matching environment variable.
        environment_used: Name of the environment used; ``None`` when no environment was active.
    """

    original_text: str = Field(..., description="Original text with variables")
    resolved_text: str = Field(..., description="Text with variables resolved")
    variables_found: List[str] = Field([], description="List of variable keys found in text")
    variables_resolved: List[str] = Field([], description="List of variable keys successfully resolved")
    variables_missing: List[str] = Field([], description="List of variable keys not found in environment")
    environment_used: Optional[str] = Field(None, description="Environment name used for resolution")

    class Config:
        from_attributes = True


class NodeMoveRequest(BaseModel):
    """Carry the target location for moving a node to a different workspace or folder.

    Attributes:
        target_workspace_id: Workspace to move the node into.
        target_folder_id: Folder within the target workspace; ``None`` moves to the workspace root.
        new_name: Name the node will have at the destination.
    """

    target_workspace_id: int = Field(..., description="ID of the target workspace")
    target_folder_id: Optional[int] = Field(None, description="ID of the target folder (null for root)")
    new_name: str = Field(..., description="New name for the moved node")

    class Config:
        from_attributes = True


class NodeCopyRequest(BaseModel):
    """Carry the target location for copying a node to a different workspace or folder.

    Attributes:
        target_workspace_id: Workspace to copy the node into.
        target_folder_id: Folder within the target workspace; ``None`` copies to the workspace root.
        new_name: Name the copied node will have at the destination.
    """

    target_workspace_id: int = Field(..., description="ID of the target workspace")
    target_folder_id: Optional[int] = Field(None, description="ID of the target folder (null for root)")
    new_name: str = Field(..., description="New name for the copied node")

    class Config:
        from_attributes = True


class ApiExecuteRequest(BaseModel):
    """Carry all parameters needed to execute a single API request directly.

    Attributes:
        file_id: File node id containing the API definition.
        environment_id: Environment to use for variable substitution; ``None`` uses the active environment.
        method: HTTP method (default ``"GET"``).
        url: Full request URL.
        headers: Request headers dict; empty dict when none.
        params: Query parameter dict; empty dict when none.
        body: Request body; ``None`` sends no body.
        body_type: Body format — ``"json"``, ``"form-data"``, ``"url-encoded"``, ``"raw"``, ``"xml"``,
                   ``"none"``; ``None`` when not specified.
        options: Additional execution options dict; empty dict when none.
        expected: Assertion criteria dict; ``None`` skips assertions.
    """

    file_id: int = Field(..., description="File ID containing the API")
    environment_id: Optional[int] = Field(None, description="Environment ID for variable resolution")
    method: str = Field("GET", description="HTTP method")
    url: str = Field(..., description="API endpoint URL")
    headers: Dict[str, Any] = Field(default_factory=dict, description="Request headers")
    params: Dict[str, Any] = Field(default_factory=dict, description="Query parameters")
    body: Any = Field(None, description="Request body")
    body_type: Optional[str] = Field(None, description="Body type: JSON, form-data, url-encoded, raw, XML, none")
    options: Dict[str, Any] = Field(default_factory=dict, description="Additional options")
    expected: Optional[Dict[str, Any]] = Field(None, description="Expected response criteria for validation")


class BulkSelectedItem(BaseModel):
    """Carry a file id and explicit list of case ids for a targeted bulk run.

    Attributes:
        file_id: File node id of the API.
        cases: List of ApiCase ids to include in the run.
    """

    file_id: int
    cases: List[int]


class BulkPayloadSelected(BaseModel):
    """Carry a bulk run payload targeting specific cases within specific APIs.

    Attributes:
        type: Always ``"selected"`` — identifies this as a case-level selection payload.
        apis: List of BulkSelectedItem entries defining which cases to run.
    """

    type: Literal["selected"]
    apis: List[BulkSelectedItem]


class BulkPayloadApi(BaseModel):
    """Carry a bulk run payload targeting all cases within a set of APIs.

    Attributes:
        type: Always ``"api"`` — identifies this as an API-level selection payload.
        apis: List of API ids whose cases will all be included in the run.
    """

    type: Literal["api"]
    apis: List[int]


BulkPayload = Union[BulkPayloadSelected, BulkPayloadApi]


class ScheduleCreate(BaseModel):
    """Carry all fields required to create a new bulk test schedule.

    Attributes:
        name: Schedule display name; 1–255 characters.
        type: ``"once"`` single run at date_time; ``"minutely"`` → every N minutes (min 20);
              ``"hourly"`` → every N hours; ``"daily"`` → daily at time;
              ``"weekly"`` → on days_of_week at time; ``"monthly"`` → on day_of_month at time.
        date_time: Exact run datetime; required for ``"once"``, ignored otherwise.
        time: ``"HH:MM"`` run time; required for hourly/daily/weekly/monthly.
        days_of_week: Day abbreviation list (e.g. ``["Mon", "Wed"]``); required for ``"weekly"``.
        day_of_month: Day number 1–31; required for ``"monthly"``.
        enabled: ``True`` activates the schedule immediately after creation.
        interval_count: Repetition interval; required for ``"minutely"`` (min 20), optional for ``"hourly"``.
        payload: Bulk run target selection — either BulkPayloadSelected or BulkPayloadApi.
    """

    name: str = Field(..., min_length=1, max_length=255)
    type: Literal["once", "minutely", "hourly", "daily", "weekly", "monthly"]

    date_time: Optional[datetime] = None
    time: Optional[str] = None
    days_of_week: Optional[List[str]] = None
    day_of_month: Optional[int] = None
    enabled: bool = True

    interval_count: Optional[int] = None

    payload: BulkPayload

    @validator("time")
    def _check_time_format(cls, v, values):
        t = values.get("type")
        if t in ("hourly", "daily", "weekly", "monthly"):
            if not v or ":" not in v:
                raise ValueError("time must be HH:MM for hourly/daily/weekly/monthly")
            h, m = v.split(":", 1)
            if not (h.isdigit() and m.isdigit()):
                raise ValueError("time must be HH:MM")
            if not (0 <= int(h) <= 23 and 0 <= int(m) <= 59):
                raise ValueError("time must be a valid clock time")
        return v

    @root_validator(skip_on_failure=True)
    def _validate_by_type(cls, values):
        t = values.get("type")
        date_time = values.get("date_time")
        time = values.get("time")
        days = values.get("days_of_week") or []
        dom = values.get("day_of_month")
        interval = values.get("interval_count")

        if t == "once":
            if not date_time:
                raise ValueError("date_time is required for type=once")

        elif t == "minutely":
            if interval is None:
                raise ValueError("interval_count is required for type=minutely")
            if interval < 20:
                raise ValueError("interval_count must be >= 20 minutes")

        elif t == "hourly":
            if interval is not None and interval < 1:
                raise ValueError("interval_count must be >= 1 when provided for type=hourly")

        elif t == "daily":
            if not time:
                raise ValueError("time (HH:MM) is required for type=daily")

        elif t == "weekly":
            if not time:
                raise ValueError("time (HH:MM) is required for type=weekly")
            if not days:
                raise ValueError("days_of_week is required for type=weekly")

        elif t == "monthly":
            if not time:
                raise ValueError("time (HH:MM) is required for type=monthly")
            if dom is None or not (1 <= dom <= 31):
                raise ValueError("day_of_month must be in 1..31 for type=monthly")

        return values


class BulkImportItemApi(BaseModel):
    """Carry the API definition fields within a bulk import item.

    Attributes:
        name: API display name.
        method: HTTP method; defaults to ``"GET"``.
        endpoint: URL path template.
        description: Optional documentation text; ``None`` when not provided.
    """

    name: str
    method: str = "GET"
    endpoint: str
    description: Optional[str] = None


class BulkImportItemCase(BaseModel):
    """Carry a single test case definition within a bulk import item.

    Attributes:
        name: Test case display name.
        headers: Optional request headers dict; ``None`` when not specified.
        params: Optional query parameters dict; ``None`` when not specified.
        body: Optional request body dict; ``None`` when not specified.
        expected: Optional assertion criteria dict; ``None`` when not specified.
    """

    name: str
    headers: Optional[Dict[str, Any]] = None
    params: Optional[Dict[str, Any]] = None
    body: Optional[Dict[str, Any]] = None
    expected: Optional[Dict[str, Any]] = None


class BulkImportItem(BaseModel):
    """Represent a single folder or file node entry in a bulk import request.

    Attributes:
        temp_id: Client-generated temporary id used to wire parent-child relationships.
        name: Node display name.
        type: ``"folder"`` or ``"file"``.
        parent_temp_id: temp_id of the parent folder; ``None`` for root-level items.
        api: API definition; ``None`` for folder items.
        cases: List of test case definitions; ``None`` for folder items or files with no cases.
    """

    temp_id: str
    name: str
    type: Literal["folder", "file"]
    parent_temp_id: Optional[str] = None
    api: Optional[BulkImportItemApi] = None
    cases: Optional[List[BulkImportItemCase]] = None


class BulkImportRequest(BaseModel):
    """Carry the workspace id and ordered item list for a bulk import operation.

    Attributes:
        workspace_id: Target workspace to import into.
        items: Flat list of BulkImportItem entries; order determines parent-before-child resolution.
    """

    workspace_id: int
    items: List[BulkImportItem]


class AlertCreate(BaseModel):
    """Carry the fields required to create a notification alert for a schedule.

    Attributes:
        type: ``"email"`` sends SMTP notification; ``"webhook"`` → sends HTTP POST payload.
        target: Email address when type is ``"email"``; webhook URL when type is ``"webhook"``.
        on_failure: ``True`` triggers alert when the run has failing cases.
        on_success: ``True`` triggers alert when all cases pass.
        on_partial: ``True`` triggers alert when some cases pass and some fail.
    """

    type: Literal["email", "webhook"]
    target: str
    on_failure: bool = True
    on_success: bool = False
    on_partial: bool = True


class AlertUpdate(BaseModel):
    """Carry optional fields for updating an existing schedule alert.

    Attributes:
        type: New notification type; ``None`` leaves current value unchanged.
        target: New target address or URL; ``None`` leaves current value unchanged.
        on_failure: New failure trigger flag; ``None`` leaves current value unchanged.
        on_success: New success trigger flag; ``None`` leaves current value unchanged.
        on_partial: New partial trigger flag; ``None`` leaves current value unchanged.
    """

    type: Optional[Literal["email", "webhook"]] = None
    target: Optional[str] = None
    on_failure: Optional[bool] = None
    on_success: Optional[bool] = None
    on_partial: Optional[bool] = None


class AlertResponse(BaseModel):
    """Represent a single schedule alert configuration record.

    Attributes:
        id: Primary key.
        schedule_id: Owning schedule id.
        type: ``"email"`` or ``"webhook"``.
        target: Email address or webhook URL.
        on_failure: ``True`` when this alert fires on run failure.
        on_success: ``True`` when this alert fires on run success.
        on_partial: ``True`` when this alert fires on partial pass/fail.
        created_at: Creation timestamp.
    """

    id: int
    schedule_id: int
    type: str
    target: str
    on_failure: bool
    on_success: bool
    on_partial: bool
    created_at: Any

    class Config:
        from_attributes = True


class InviteCreate(BaseModel):
    """Carry the email and role for sending a workspace membership invitation.

    Attributes:
        email: Email address of the person being invited.
        role: ``"viewer"`` (default) read-only; ``"editor"`` → modify content;
              ``"admin"`` → editor + can invite others.
    """

    email: EmailStr
    role: Literal["viewer", "editor", "admin"] = "viewer"


class MemberRoleUpdate(BaseModel):
    """Carry the new role for updating an existing workspace member.

    Attributes:
        role: ``"viewer"`` read-only; ``"editor"`` → modify content; ``"admin"`` → editor + invite.
    """

    role: Literal["viewer", "editor", "admin"]


class MemberResponse(BaseModel):
    """Represent a joined workspace member with their user identity and role.

    Attributes:
        user_id: Member's user primary key.
        username: Member's display name.
        email: Member's email address.
        role: Assigned role — ``"viewer"``, ``"editor"``, or ``"admin"``.
        joined_at: Timestamp when the invite was accepted; ``None`` while still pending.
    """

    user_id: int
    username: str
    email: str
    role: str
    joined_at: Any

    class Config:
        from_attributes = True


class InviteResponse(BaseModel):
    """Represent a pending workspace invite record.

    Attributes:
        id: Invite primary key.
        email: Email the invite was sent to.
        role: Role to be granted on acceptance.
        expires_at: Timestamp after which the invite link is no longer valid.
        accepted: ``True`` once the invite has been accepted; ``False`` while pending.
        created_at: Creation timestamp.
    """

    id: int
    email: str
    role: str
    expires_at: Any
    accepted: bool
    created_at: Any

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Phase 3 — Auth Helpers: per-type auth config models
# ---------------------------------------------------------------------------

class AuthNone(BaseModel):
    """Carry a no-auth declaration for an API.

    Attributes:
        type: Always ``"none"``.
    """

    type: Literal["none"] = "none"


class AuthApiKey(BaseModel):
    """Carry API-key auth config for an API.

    Attributes:
        type: Always ``"apikey"``.
        key: Header or query-parameter name (e.g. ``"X-API-Key"``).
        value: The API key value; encrypted at rest.
        in_: ``"header"`` (default) injects the key as a request header;
             ``"query"`` → appends it as a URL query parameter.
    """

    type: Literal["apikey"] = "apikey"
    key: str = Field(..., min_length=1, description="Header or query param name")
    value: str = Field(..., description="API key value (encrypted at rest)")
    in_: Literal["header", "query"] = Field("header", alias="in")

    class Config:
        populate_by_name = True


class AuthBearer(BaseModel):
    """Carry Bearer token auth config for an API.

    Attributes:
        type: Always ``"bearer"``.
        token: The bearer token value; encrypted at rest.
    """

    type: Literal["bearer"] = "bearer"
    token: str = Field(..., description="Bearer token (encrypted at rest)")


class AuthBasic(BaseModel):
    """Carry HTTP Basic auth config for an API.

    Attributes:
        type: Always ``"basic"``.
        username: Basic auth username.
        password: Basic auth password; encrypted at rest.
    """

    type: Literal["basic"] = "basic"
    username: str = Field(..., description="Basic auth username")
    password: str = Field(..., description="Basic auth password (encrypted at rest)")


class AuthAwsSigV4(BaseModel):
    """Carry AWS Signature Version 4 auth config for an API.

    Attributes:
        type: Always ``"aws_sigv4"``.
        access_key: AWS access key ID; encrypted at rest.
        secret_key: AWS secret access key; encrypted at rest.
        region: AWS region (e.g. ``"us-east-1"``).
        service: AWS service name (e.g. ``"execute-api"``).
    """

    type: Literal["aws_sigv4"] = "aws_sigv4"
    access_key: str = Field(..., description="AWS access key ID (encrypted at rest)")
    secret_key: str = Field(..., description="AWS secret access key (encrypted at rest)")
    region: str = Field(..., description="AWS region (e.g. us-east-1)")
    service: str = Field(..., description="AWS service name (e.g. execute-api)")


class AuthJwt(BaseModel):
    """Carry JWT builder auth config for an API.

    Attributes:
        type: Always ``"jwt"``.
        secret: Signing secret; encrypted at rest.
        algorithm: JWT signing algorithm (default ``"HS256"``).
        payload: JSON dict of claims to include in the token.
        header_name: Request header to inject the signed JWT into (default ``"Authorization"``).
        header_prefix: Prefix prepended before the token (default ``"Bearer"``);
                       empty string → token injected with no prefix.
    """

    type: Literal["jwt"] = "jwt"
    secret: str = Field(..., description="JWT signing secret (encrypted at rest)")
    algorithm: str = Field("HS256", description="Signing algorithm")
    payload: Dict[str, Any] = Field(default_factory=dict, description="JWT claims")
    header_name: str = Field("Authorization", description="Header to inject signed JWT into")
    header_prefix: str = Field("Bearer", description="Prefix before the token value")


class AuthOAuth2(BaseModel):
    """Carry OAuth2 auth config for an API.

    Attributes:
        type: Always ``"oauth2"``.
        grant: ``"client_credentials"`` uses machine-to-machine grant;
               ``"authorization_code"`` → user-redirect grant.
        token_url: OAuth2 token endpoint URL.
        client_id: OAuth2 client identifier.
        client_secret: OAuth2 client secret; encrypted at rest.
        scope: Space-separated scope string; empty string when no scope is needed.
        auth_ref: Opaque cache key used to look up a stored token; ``None`` when no token is cached yet.
    """

    type: Literal["oauth2"] = "oauth2"
    grant: Literal["client_credentials", "authorization_code"] = "client_credentials"
    token_url: str = Field(..., description="OAuth2 token endpoint URL")
    client_id: str = Field(..., description="OAuth2 client ID")
    client_secret: str = Field(..., description="OAuth2 client secret (encrypted at rest)")
    scope: str = Field("", description="Space-separated OAuth2 scope string")
    auth_ref: Optional[str] = Field(None, description="Cache key for stored token")


AuthConfig = Union[AuthNone, AuthApiKey, AuthBearer, AuthBasic, AuthAwsSigV4, AuthJwt, AuthOAuth2]


class SetAuthRequest(BaseModel):
    """Carry the auth config to persist on an API.

    Attributes:
        type: Auth type discriminator — ``"none"``, ``"apikey"``, ``"bearer"``, ``"basic"``,
              ``"aws_sigv4"``, ``"jwt"``, or ``"oauth2"``.
        config: Type-specific auth config dict; contents depend on the chosen type.
    """

    type: Literal["none", "apikey", "bearer", "basic", "aws_sigv4", "jwt", "oauth2"]
    config: Dict[str, Any] = Field(default_factory=dict, description="Type-specific auth config")
