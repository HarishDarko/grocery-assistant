"""
Mock MongoDB for local development without real MongoDB connection
"""
import json
import os
import time
from datetime import datetime
from bson import ObjectId

class MockCollection:
    def __init__(self, name, data_dir='./mock_data'):
        self.name = name
        self.data_dir = data_dir
        self.data = []
        self._load_data()
        self._indexes = []
        
    def _ensure_dir(self):
        """Ensure the data directory exists"""
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)
    
    def _get_file_path(self):
        """Get the file path for this collection"""
        return os.path.join(self.data_dir, f"{self.name}.json")
    
    def _load_data(self):
        """Load data from file"""
        self._ensure_dir()
        file_path = self._get_file_path()
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    # Convert string ObjectIds back to MockObjectId
                    data = json.load(f)
                    for item in data:
                        if '_id' in item and isinstance(item['_id'], str):
                            item['_id'] = MockObjectId(item['_id'])
                    self.data = data
            except:
                self.data = []
        else:
            self.data = []
    
    def _save_data(self):
        """Save data to file"""
        self._ensure_dir()
        file_path = self._get_file_path()
        try:
            # Convert MockObjectId to string for JSON serialization
            serializable_data = []
            for item in self.data:
                item_copy = item.copy()
                if '_id' in item_copy and isinstance(item_copy['_id'], MockObjectId):
                    item_copy['_id'] = str(item_copy['_id'])
                serializable_data.append(item_copy)
                
            with open(file_path, 'w') as f:
                json.dump(serializable_data, f, indent=2)
        except Exception as e:
            print(f"Error saving data: {e}")
    
    def create_index(self, keys, **kwargs):
        """Mock index creation"""
        unique = kwargs.get('unique', False)
        index = {'keys': keys, 'unique': unique}
        self._indexes.append(index)
        return index
    
    def _check_indexes(self, doc):
        """Check if document violates any unique indexes"""
        for index in self._indexes:
            if not index.get('unique'):
                continue
                
            for key_tuple in index.get('keys', []):
                field = key_tuple[0]
                if field in doc:
                    # Check for uniqueness
                    value = doc[field]
                    for existing_doc in self.data:
                        if existing_doc.get('_id') == doc.get('_id'):
                            continue  # Skip current document
                        if existing_doc.get(field) == value:
                            raise ValueError(f"Duplicate key error: {field} must be unique")
    
    def find_one(self, query=None, projection=None):
        """Find one document matching the query"""
        query = query or {}
        
        for doc in self.data:
            if self._matches(doc, query):
                if projection:
                    return self._apply_projection(doc, projection)
                return doc
        return None
    
    def find(self, query=None):
        """Find all documents matching the query"""
        query = query or {}
        results = []
        
        for doc in self.data:
            if self._matches(doc, query):
                results.append(doc)
        
        return MockCursor(results)
    
    def insert_one(self, document):
        """Insert one document"""
        # Create a copy to avoid modifying the original
        doc = document.copy()
        
        # Add _id if not present
        if '_id' not in doc:
            doc['_id'] = MockObjectId()
            
        # Check indexes
        self._check_indexes(doc)
        
        self.data.append(doc)
        self._save_data()
        
        return MockInsertOneResult(doc['_id'])
    
    def delete_one(self, query):
        """Delete one document matching the query"""
        for i, doc in enumerate(self.data):
            if self._matches(doc, query):
                del self.data[i]
                self._save_data()
                return MockDeleteResult(1)
        
        return MockDeleteResult(0)
    
    def _matches(self, doc, query):
        """Check if document matches the query"""
        for key, value in query.items():
            if key == '$or':
                # Handle $or operator
                if not isinstance(value, list):
                    return False
                    
                # At least one condition in $or must match
                or_result = False
                for condition in value:
                    if self._matches(doc, condition):
                        or_result = True
                        break
                        
                if not or_result:
                    return False
            elif key == '$and':
                # Handle $and operator
                if not isinstance(value, list):
                    return False
                    
                # All conditions in $and must match
                for condition in value:
                    if not self._matches(doc, condition):
                        return False
            else:
                # Direct comparison
                if key not in doc:
                    return False
                    
                if isinstance(value, dict):
                    # Handle operators
                    for op, op_value in value.items():
                        if op == '$eq' and doc[key] != op_value:
                            return False
                        elif op == '$ne' and doc[key] == op_value:
                            return False
                        elif op == '$gt' and not (doc[key] > op_value):
                            return False
                        elif op == '$gte' and not (doc[key] >= op_value):
                            return False
                        elif op == '$lt' and not (doc[key] < op_value):
                            return False
                        elif op == '$lte' and not (doc[key] <= op_value):
                            return False
                elif doc[key] != value:
                    return False
                    
        return True
    
    def _apply_projection(self, doc, projection):
        """Apply projection to document"""
        if not projection:
            return doc
            
        result = {}
        include_mode = True
        
        # Determine if we're in include or exclude mode
        for field, include in projection.items():
            if include == 1:
                include_mode = True
                break
            elif include == 0:
                include_mode = False
                break
        
        if include_mode:
            # Include mode: only include specified fields
            for field, include in projection.items():
                if include == 1 and field in doc:
                    result[field] = doc[field]
        else:
            # Exclude mode: include all fields except specified ones
            for field, value in doc.items():
                if field not in projection or projection[field] != 0:
                    result[field] = value
                    
        return result

class MockCursor:
    def __init__(self, results):
        self.results = results
        
    def __iter__(self):
        return iter(self.results)
        
    def __next__(self):
        return next(self.results)

class MockObjectId:
    def __init__(self, oid=None):
        if oid:
            self.oid = oid
        else:
            self.oid = hex(int(time.time() * 1000))[2:]
            
    def __str__(self):
        return self.oid
        
    def __eq__(self, other):
        if isinstance(other, MockObjectId):
            return self.oid == other.oid
        elif isinstance(other, str):
            return self.oid == other
        return False

class MockDeleteResult:
    def __init__(self, deleted_count):
        self.deleted_count = deleted_count

class MockInsertOneResult:
    def __init__(self, inserted_id):
        self.inserted_id = inserted_id

class MockDatabase:
    def __init__(self, name, data_dir='./mock_data'):
        self.name = name
        self.data_dir = data_dir
        self.collections = {}
        
    def __getattr__(self, name):
        if name not in self.collections:
            self.collections[name] = MockCollection(name, self.data_dir)
        return self.collections[name]
        
    def get_collection(self, name):
        return getattr(self, name)

class MockMongoClient:
    def __init__(self, uri=None, **kwargs):
        self.uri = uri
        self.data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'mock_data')
        self.db = MockDatabase('grocery_assistant', self.data_dir)
        
    def get_database(self, name=None):
        return self.db
        
    def admin(self):
        return MockAdminDB()
        
    def close(self):
        pass

class MockAdminDB:
    def command(self, command, *args, **kwargs):
        if command == 'ping':
            return {'ok': 1.0}
        raise NotImplementedError(f"Command {command} not implemented in mock")

# Example usage in your code:
# from utils.mock_db import MockMongoClient
# MONGODB_URI = os.environ.get('MONGODB_URI')
# if MONGODB_URI and MONGODB_URI.startswith('mock://'):
#     client = MockMongoClient()
# else:
#     client = MongoClient(MONGODB_URI) 