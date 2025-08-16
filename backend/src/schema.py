# schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional


class PaginationRes(BaseModel):
    page: int
    rows: int
    total_rows: int

    class Config:
        from_attributes = True

# Pydantic models for request/response
class UserSignUp(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserSignIn(BaseModel):
    username: str
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None

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