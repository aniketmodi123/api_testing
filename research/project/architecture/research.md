# Research — Architecture

LAST_UPDATED: 2026-06-07

## Existing Code to Reuse

| File | Function/Component | How to use |
|---|---|---|
| backend/src/utils.py | `create_response()` | Use for ALL new endpoints — never return raw dict |
| backend/src/utils.py | `resolve_variables()` | Use whenever user text needs {{VAR}} substitution |
| backend/src/utils.py | `ExceptionHandler()` | Wrap all except blocks in new routers |
| backend/src/common_querys.py | `get_user_by_username()` | First call in every authenticated endpoint |
| backend/src/common_querys.py | `verify_node_ownership()` | Before any node operation |
| backend/src/common_querys.py | `get_headers()` | Get merged headers for any file node |
| backend/src/common_querys.py | `get_workspace_variables()` | Get active env variables for a workspace |
| frontend/src/store/apiSlice.js | RTK Query endpoints | Add new endpoints here, get auto-generated hooks |
| frontend/src/components/common/ | Button, JsonEditor | Reuse in new components |

## New Endpoint Pattern (FastAPI)
```python
from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from config import get_db
from common_querys import get_user_by_username
from utils import create_response, ExceptionHandler

router = APIRouter()

@router.post("/your-endpoint")
async def your_endpoint(
    body: YourSchema,
    username: str = Header(...),
    db: AsyncSession = Depends(get_db)
):
    try:
        user = await get_user_by_username(db, username)
        if not user:
            return create_response(400, error_message="User not found")
        # ... logic
        return create_response(200, data=result)
    except Exception as e:
        return ExceptionHandler(e)
```

## New RTK Query Endpoint Pattern (Frontend)
```js
// In apiSlice.js endpoints builder:
newFeature: builder.query({
  query: (param) => `/your-endpoint/${param}`,
  providesTags: ['YourTag'],
}),
newFeatureMutation: builder.mutation({
  query: ({ id, ...data }) => ({
    url: `/your-endpoint/${id}`,
    method: 'POST',
    body: data,
  }),
  invalidatesTags: ['YourTag'],
}),
// Then export the generated hook at bottom of file
```

## New SQLAlchemy Model Pattern
```python
class YourModel(Base):
    __tablename__ = "your_table"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[str] = mapped_column(TIMESTAMP, default=datetime.now, server_default=func.now())
    # Add to main.py: from models import YourModel (triggers table creation on startup)
```

## Gotchas
| # | Thing | Why it trips you up | How to handle |
|---|---|---|---|
| 1 | username header | Backend reads `username` header, NOT JWT sub claim | Always send `username` header from frontend |
| 2 | 206 vs 404 | Backend uses 206 for "not found" — RTK Query treats it as success | Check `error_message` field in 206 responses |
| 3 | workspace-id header | Scheduler endpoints need `workspace-id` as a header | Add to RTK Query prepareHeaders or pass per-request |
| 4 | SSL disabled | `verify=False` on all outbound httpx calls | Fine for dev, must revisit for production |
| 5 | Pydantic v1 | Uses `@validator`, `root_validator` (v1 style) | Don't use `@field_validator` (v2 style) |
| 6 | Schema forward refs | `NodeResponse.model_rebuild()` needed for self-referencing | Add `model_rebuild()` after class definition |
