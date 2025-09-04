# Environment Management UI Mockups & Component Specifications

## 🖼️ **UI Layout & Component Mockups**

### **1. Main Environment Dashboard**

```
┌─────────────────────────────────────────────────────────────────┐
│ Workspace: "My Project"           [🌍 Environment: Development ▼]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────────────────────────────────────┐  [+ New Environment]│
│ │           🌍 Environments                   │  [📝 From Template] │
│ │                                             │                 │
│ │ ┌──────────────────┐  ┌──────────────────┐  │                 │
│ │ │ 🟢 Development   │  │   Production     │  │                 │
│ │ │ Active           │  │   2 variables    │  │                 │
│ │ │ 5 variables      │  │   Created 2 days │  │                 │
│ │ │ ⚙️ 📝 🗑️         │  │   ⚙️ 📝 🗑️      │  │                 │
│ │ └──────────────────┘  └──────────────────┘  │                 │
│ │                                             │                 │
│ │ ┌──────────────────┐                       │                 │
│ │ │   Staging        │                       │                 │
│ │ │   3 variables    │                       │                 │
│ │ │   Created 1 week │                       │                 │
│ │ │   ⚙️ 📝 🗑️      │                       │                 │
│ │ └──────────────────┘                       │                 │
│ └─────────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

### **2. Environment Detail View**

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Environments    Development Environment     [Activate] │
├─────────────────────────────────────────────────────────────────┤
│ Name: Development                                               │
│ Description: Development environment for local testing          │
│ Status: 🟢 Active                                              │
│                                                   [Edit Info]   │
├─────────────────────────────────────────────────────────────────┤
│                    Variables (5)                [+ Add Variable]│
│ ┌─Search variables...─────────────────────────┐ [🔄] [📤] [📥] │
│ └─────────────────────────────────────────────┘                 │
│                                                                 │
│ ┌─────┬─────────────┬──────────────┬─────┬─────────┬─────────┐  │
│ │ Key │ Value       │ Description  │ Sec │ Enabled │ Actions │  │
│ ├─────┼─────────────┼──────────────┼─────┼─────────┼─────────┤  │
│ │API_URL│http://local..│Base API URL │  □  │    ✅   │ ✏️ 🗑️  │  │
│ │API_KEY│***HIDDEN*** │Secret token  │  🔒  │    ✅   │ ✏️ 🗑️  │  │
│ │DEBUG  │true         │Debug mode    │  □  │    ✅   │ ✏️ 🗑️  │  │
│ │DB_HOST│localhost    │Database host │  □  │    ❌   │ ✏️ 🗑️  │  │
│ │TIMEOUT│30           │Request timeout│ □  │    ✅   │ ✏️ 🗑️  │  │
│ └─────┴─────────────┴──────────────┴─────┴─────────┴─────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### **3. Add/Edit Variable Modal**

```
┌─────────────────────────────────────────┐
│           Add New Variable              │
├─────────────────────────────────────────┤
│ Key *                                   │
│ ┌─────────────────────────────────────┐ │
│ │ DATABASE_URL                        │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Value                                   │
│ ┌─────────────────────────────────────┐ │
│ │ postgresql://localhost:5432/db      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Description                             │
│ ┌─────────────────────────────────────┐ │
│ │ Database connection string          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ☑️ Enabled     🔒 Secret Variable       │
│                                         │
│              [Cancel] [Save Variable]   │
└─────────────────────────────────────────┘
```

### **4. Template Selection Modal**

```
┌─────────────────────────────────────────────────────────────────┐
│                 Create Environment from Template               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌──────────────────────┐  ┌──────────────────────┐              │
│ │ 🧪 API Testing       │  │ 💻 Development       │              │
│ │                      │  │                      │              │
│ │ • BASE_URL           │  │ • BASE_URL           │              │
│ │ • API_KEY (secret)   │  │ • DEBUG              │              │
│ │ • USER_ID            │  │ • DB_HOST            │              │
│ │ • TIMEOUT            │  │ • DB_PASSWORD (secret)│              │
│ │                      │  │                      │              │
│ │     [Select]         │  │     [Select]         │              │
│ └──────────────────────┘  └──────────────────────┘              │
│                                                                 │
│ ┌──────────────────────┐                                        │
│ │ 🚀 Production        │                                        │
│ │                      │                                        │
│ │ • BASE_URL           │                                        │
│ │ • API_KEY (secret)   │                                        │
│ │ • TIMEOUT            │                                        │
│ │ • RATE_LIMIT         │                                        │
│ │                      │                                        │
│ │     [Select]         │                                        │
│ └──────────────────────┘                                        │
│                                                                 │
│                                      [Cancel] [Create Custom]   │
└─────────────────────────────────────────────────────────────────┘
```

### **5. Variable Resolution Panel**

```
┌─────────────────────────────────────────────────────────────────┐
│                    🔧 Variable Resolution                       │
├─────────────────────────────────────────────────────────────────┤
│ Environment: [Development ▼]                                   │
│                                                                 │
│ Input Request:                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ GET {{BASE_URL}}/users?token={{API_TOKEN}}                  │ │
│ │ Headers:                                                    │ │
│ │ Authorization: Bearer {{AUTH_TOKEN}}                        │ │
│ │ Content-Type: application/json                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Preview (Resolved):                           [📋 Copy Result] │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ GET https://api.dev.example.com/users?token=dev_token_123   │ │
│ │ Headers:                                                    │ │
│ │ Authorization: Bearer auth_dev_token                        │ │
│ │ Content-Type: application/json                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ Variables Found: ✅ BASE_URL ✅ API_TOKEN ❌ AUTH_TOKEN         │
│ Missing: AUTH_TOKEN (not found in Development environment)     │
└─────────────────────────────────────────────────────────────────┘
```

### **6. Environment Switcher (Header Component)**

```
┌─────────────────────────────────────────────────────────────────┐
│ API Testing Platform                          🌍 Development ▼ │
│                                                                 │
│ [Dropdown when clicked:]                                        │
│ ┌───────────────────────┐                                      │
│ │ 🟢 Development (Active)│                                      │
│ │ 🔘 Production         │                                      │
│ │ 🔘 Staging            │                                      │
│ │ ──────────────────────│                                      │
│ │ ⚙️ Manage Environments │                                      │
│ └───────────────────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎨 **Component Specifications**

### **EnvironmentCard Component**

```typescript
interface EnvironmentCardProps {
  environment: Environment;
  isActive: boolean;
  onActivate: (id: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onView: (id: number) => void;
}

// Visual states:
// - Active: Green border, "Active" badge
// - Inactive: Gray border
// - Hover: Slight shadow, actions visible
```

### **VariableTable Component**

```typescript
interface VariableTableProps {
  variables: EnvironmentVariable[];
  onEdit: (variable: EnvironmentVariable) => void;
  onDelete: (id: number) => void;
  onToggleEnabled: (id: number, enabled: boolean) => void;
  searchTerm: string;
  sortBy: 'key' | 'created_at';
  sortOrder: 'asc' | 'desc';
}

// Features:
// - Inline editing for key/value
// - Secret value masking
// - Sort by key or date
// - Search/filter
// - Bulk operations
```

### **VariableForm Component**

```typescript
interface VariableFormProps {
  variable?: EnvironmentVariable; // undefined for create
  onSave: (data: VariableCreateRequest) => void;
  onCancel: () => void;
  existingKeys: string[]; // for validation
}

// Validation rules:
// - Key: required, unique, alphanumeric + underscore/hyphen
// - Value: optional, any string
// - Real-time validation feedback
```

### **ResolutionPanel Component**

```typescript
interface ResolutionPanelProps {
  environments: Environment[];
  activeEnvironmentId?: number;
  onEnvironmentChange: (id: number) => void;
}

// Features:
// - Syntax highlighting for {{variables}}
// - Real-time resolution preview
// - Missing variable warnings
// - Copy resolved text
```

---

## 🔧 **State Management**

### **Redux/Context Store Structure**

```typescript
interface AppState {
  environments: {
    list: Environment[];
    active: Environment | null;
    selected: Environment | null;
    loading: boolean;
    error: string | null;
  };
  variables: {
    list: EnvironmentVariable[];
    loading: boolean;
    error: string | null;
  };
  resolution: {
    inputText: string;
    resolvedText: string;
    variablesFound: string[];
    variablesMissing: string[];
    selectedEnvironmentId?: number;
  };
  ui: {
    showCreateModal: boolean;
    showEditModal: boolean;
    showTemplateModal: boolean;
    showResolutionPanel: boolean;
  };
}
```

### **API Service Layer**

```typescript
class EnvironmentService {
  static async getEnvironments(
    workspaceId: number
  ): Promise<EnvironmentListResponse>;
  static async createEnvironment(
    workspaceId: number,
    data: EnvironmentCreate
  ): Promise<Environment>;
  static async createFromTemplate(
    workspaceId: number,
    template: string
  ): Promise<Environment>;
  static async updateEnvironment(
    workspaceId: number,
    id: number,
    data: EnvironmentUpdate
  ): Promise<Environment>;
  static async deleteEnvironment(
    workspaceId: number,
    id: number
  ): Promise<void>;
  static async activateEnvironment(
    workspaceId: number,
    id: number
  ): Promise<Environment>;

  static async getVariables(
    workspaceId: number,
    environmentId: number
  ): Promise<EnvironmentVariable[]>;
  static async createVariable(
    workspaceId: number,
    environmentId: number,
    data: VariableCreate
  ): Promise<EnvironmentVariable>;
  static async updateVariable(
    workspaceId: number,
    environmentId: number,
    id: number,
    data: VariableUpdate
  ): Promise<EnvironmentVariable>;
  static async deleteVariable(
    workspaceId: number,
    environmentId: number,
    id: number
  ): Promise<void>;

  static async resolveVariables(
    workspaceId: number,
    text: string,
    environmentId?: number
  ): Promise<VariableResolutionResponse>;
  static async getActiveVariables(
    workspaceId: number
  ): Promise<ResolvedVariables>;
}
```

---

## 🎯 **User Interaction Flows**

### **Flow 1: Create First Environment**

1. User clicks "New Environment" button
2. Template selection modal opens
3. User selects "API Testing" template
4. Environment created with pre-defined variables
5. User customizes variable values
6. Environment automatically activated
7. Success notification shown

### **Flow 2: Switch Environment**

1. User clicks environment dropdown in header
2. List of environments shown with active indicator
3. User selects different environment
4. Confirmation modal if current has unsaved changes
5. Environment activated
6. UI updates to reflect new active environment
7. Resolution panel updates automatically

### **Flow 3: Test API with Variables**

1. User opens resolution panel
2. Enters API request text with {{variables}}
3. Real-time preview shows resolved version
4. Missing variables highlighted in red
5. User adds missing variables to active environment
6. Preview updates automatically
7. User copies resolved text for testing

### **Flow 4: Manage Secrets**

1. User adds new variable
2. Toggles "Secret" checkbox
3. Value input becomes password field
4. Warning shown about secret handling
5. Variable saved with secret flag
6. In table view, value shows as "**_HIDDEN_**"
7. Resolution still works with actual secret value

---

## 🎨 **Design System**

### **Colors**

```css
:root {
  --env-active: #10b981; /* Green for active environment */
  --env-inactive: #6b7280; /* Gray for inactive */
  --secret-indicator: #f59e0b; /* Amber for secret variables */
  --variable-found: #10b981; /* Green for resolved variables */
  --variable-missing: #ef4444; /* Red for missing variables */
  --border-light: #e5e7eb; /* Light gray borders */
  --background-card: #ffffff; /* White card background */
  --background-hover: #f9fafb; /* Light gray hover */
}
```

### **Icons**

- 🌍 Environment indicator
- 🟢 Active status
- 🔒 Secret variable
- ✅ Enabled/Found
- ❌ Disabled/Missing
- ⚙️ Settings/Configure
- 📝 Edit
- 🗑️ Delete
- 📋 Copy
- 📤 Export
- 📥 Import
- 🔄 Refresh

### **Typography**

- Environment names: 16px, semibold
- Variable keys: 14px, monospace
- Variable values: 14px, monospace
- Descriptions: 12px, regular
- Status text: 11px, uppercase

This comprehensive mockup and specification should give your frontend team everything they need to build a professional environment management system that matches Postman's functionality and user experience!
