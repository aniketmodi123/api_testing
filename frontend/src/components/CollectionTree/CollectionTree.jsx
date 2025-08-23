import { useState } from 'react';
import { useWorkspace } from '../../store/workspace';
import styles from './CollectionTree.module.css';

// Fallback sample data if workspace tree is not available
const sampleCollections = [
  {
    id: 1,
    name: 'API Testing',
    items: [
      {
        id: 'folder-1',
        type: 'folder',
        name: 'Users API',
        items: [
          {
            id: 'req-1',
            type: 'request',
            method: 'GET',
            name: 'Get All Users',
            url: 'https://api.example.com/users',
          },
          {
            id: 'req-2',
            type: 'request',
            method: 'POST',
            name: 'Create User',
            url: 'https://api.example.com/users',
          },
        ],
      },
      {
        id: 'folder-2',
        type: 'folder',
        name: 'Products API',
        items: [
          {
            id: 'req-3',
            type: 'request',
            method: 'GET',
            name: 'Get All Products',
            url: 'https://api.example.com/products',
          },
        ],
      },
      {
        id: 'req-4',
        type: 'request',
        method: 'GET',
        name: 'Health Check',
        url: 'https://api.example.com/health',
      },
    ],
  },
  {
    id: 2,
    name: 'Workspace API',
    items: [
      {
        id: 'req-5',
        type: 'request',
        method: 'GET',
        name: 'List Workspace',
        url: 'https://api.example.com/workspace',
      },
    ],
  },
];

export default function CollectionTree({ onSelectRequest }) {
  const { workspaceTree, activeWorkspace, loading } = useWorkspace();
  const [expandedCollections, setExpandedCollections] = useState([1]); // Default first collection expanded
  const [expandedFolders, setExpandedFolders] = useState(['folder-1']); // Default first folder expanded
  const [selectedItem, setSelectedItem] = useState(null);

  // Use workspaceTree data if available, otherwise fallback to sample data
  const collections = workspaceTree?.collections || sampleCollections;

  const toggleCollection = collectionId => {
    setExpandedCollections(prev =>
      prev.includes(collectionId)
        ? prev.filter(id => id !== collectionId)
        : [...prev, collectionId]
    );
  };

  const toggleFolder = folderId => {
    setExpandedFolders(prev =>
      prev.includes(folderId)
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  const handleSelectRequest = request => {
    setSelectedItem(request.id);
    onSelectRequest && onSelectRequest(request);
  };

  // Method badge color based on HTTP method
  const getMethodColor = method => {
    const methodColors = {
      GET: '#10b981', // Green
      POST: '#f97316', // Orange
      PUT: '#3b82f6', // Blue
      DELETE: '#ef4444', // Red
      PATCH: '#8b5cf6', // Purple
      HEAD: '#6b7280', // Gray
      OPTIONS: '#6b7280', // Gray
    };

    return methodColors[method] || '#6b7280';
  };

  return (
    <div className={styles.collectionTree}>
      <div className={styles.header}>
        <input
          type="text"
          placeholder="Filter"
          className={styles.filterInput}
        />
        <button className={styles.addButton}>+</button>
      </div>

      <div className={styles.treeContainer}>
        {loading && !collections.length ? (
          <div className={styles.loadingState}>
            <p>Loading collections...</p>
          </div>
        ) : collections.length > 0 ? (
          collections.map(collection => (
            <div key={collection.id} className={styles.collection}>
              <div
                className={styles.collectionHeader}
                onClick={() => toggleCollection(collection.id)}
              >
                <span className={styles.expansionIcon}>
                  {expandedCollections.includes(collection.id) ? '▼' : '▶'}
                </span>
                <span className={styles.collectionIcon}>📁</span>
                <span className={styles.collectionName}>{collection.name}</span>
              </div>

              {expandedCollections.includes(collection.id) && (
                <div className={styles.collectionItems}>
                  {collection.items.map(item => (
                    <div key={item.id}>
                      {item.type === 'folder' ? (
                        <div>
                          <div
                            className={styles.folderHeader}
                            onClick={() => toggleFolder(item.id)}
                          >
                            <span className={styles.expansionIcon}>
                              {expandedFolders.includes(item.id) ? '▼' : '▶'}
                            </span>
                            <span className={styles.folderIcon}>📂</span>
                            <span className={styles.folderName}>
                              {item.name}
                            </span>
                          </div>

                          {expandedFolders.includes(item.id) && item.items && (
                            <div className={styles.folderItems}>
                              {item.items.map(subItem => (
                                <div
                                  key={subItem.id}
                                  className={`${styles.requestItem} ${selectedItem === subItem.id ? styles.selected : ''}`}
                                  onClick={() => handleSelectRequest(subItem)}
                                >
                                  <span
                                    className={styles.methodBadge}
                                    style={{
                                      backgroundColor: getMethodColor(
                                        subItem.method
                                      ),
                                    }}
                                  >
                                    {subItem.method}
                                  </span>
                                  <span className={styles.requestName}>
                                    {subItem.name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`${styles.requestItem} ${selectedItem === item.id ? styles.selected : ''}`}
                          onClick={() => handleSelectRequest(item)}
                        >
                          <span
                            className={styles.methodBadge}
                            style={{
                              backgroundColor: getMethodColor(item.method),
                            }}
                          >
                            {item.method}
                          </span>
                          <span className={styles.requestName}>
                            {item.name}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className={styles.emptyState}>
            <p>No collections found</p>
            <button className={styles.createButton}>Create Collection</button>
          </div>
        )}
      </div>
    </div>
  );
}
