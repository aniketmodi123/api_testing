"""
What this file does: Exposes POST /api/graphql-introspect for sending a full introspection query to a target GraphQL endpoint and returning its schema.
"""
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel

from schema import GraphQLIntrospectResponse
from ssrf import assert_safe_url
from utils import ExceptionHandler, create_response, handle_http_error

router = APIRouter()

_INTROSPECTION_QUERY = """
query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types { ...FullType }
    directives { name description locations args { ...InputValue } }
  }
}
fragment FullType on __Type {
  kind name description
  fields(includeDeprecated: true) {
    name description args { ...InputValue }
    type { ...TypeRef }
    isDeprecated deprecationReason
  }
  inputFields { ...InputValue }
  interfaces { ...TypeRef }
  enumValues(includeDeprecated: true) { name description isDeprecated deprecationReason }
  possibleTypes { ...TypeRef }
}
fragment InputValue on __InputValue {
  name description type { ...TypeRef } defaultValue
}
fragment TypeRef on __Type {
  kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
}
"""


class GraphQLIntrospectRequest(BaseModel):
    """Request body for POST /api/graphql-introspect.
    Attributes:
        url: Fully-qualified URL of the target GraphQL endpoint.
        headers: Optional HTTP headers to forward with the introspection request; None sends no extra headers.
    """
    url: str
    headers: Optional[Dict[str, Any]] = None


@router.post("/graphql-introspect")
async def graphql_introspect(body: GraphQLIntrospectRequest):
    """POST /api/graphql-introspect — proxy a GraphQL introspection query to the target URL and return the raw schema.

    Notes:
        - No per-route identity check: this is a stateless probe with no user-scoped resource
          to authorize against; the global JWT AuthMiddleware already gates the route.
    """
    try:
        assert_safe_url(body.url)

        req_headers = {**(body.headers or {}), "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                body.url,
                json={"query": _INTROSPECTION_QUERY},
                headers=req_headers,
            )
        data = resp.json()
        if "data" not in data or "__schema" not in (data.get("data") or {}):
            return create_response(502, error_message="Endpoint did not return a valid GraphQL schema")
        return create_response(200, data=data, schema=GraphQLIntrospectResponse)
    except ValueError as e:
        return create_response(400, error_message=str(e))
    except (httpx.HTTPError, httpx.ConnectError, httpx.TimeoutException) as e:
        return handle_http_error(e, url=body.url, method="POST", headers=body.headers or {})
    except Exception as e:
        return ExceptionHandler(e)
