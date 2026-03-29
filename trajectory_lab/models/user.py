from datetime import datetime
import uuid
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='VIEWER') # ADMIN, DISPATCHER, VIEWER
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
        
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)
    action = db.Column(db.String(50), nullable=False)     
    resource = db.Column(db.String(50), nullable=True) 
    details = db.Column(db.Text, nullable=True)         
    ip_address = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Task(db.Model):
    __tablename__ = 'tasks'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    city = db.Column(db.String(50), nullable=False, default='shenzhen')
    flight_id = db.Column(db.String(100), nullable=True)
    start_lat = db.Column(db.Float, nullable=False)
    start_lon = db.Column(db.Float, nullable=False)
    end_lat = db.Column(db.Float, nullable=False)
    end_lon = db.Column(db.Float, nullable=False)
    start_poi_id = db.Column(db.String(50), nullable=True)
    end_poi_id = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(20), nullable=False, default='PENDING') # PENDING, APPROVED, EXECUTING, COMPLETED, REJECTED
    trajectory_data = db.Column(db.Text, nullable=True) # JSON string
    creator_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class FlightLog(db.Model):
    """持久化的飞行轨迹记录（仅存储批量生成的轨迹，不含临时单条）"""
    __tablename__ = 'flight_logs'
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    city = db.Column(db.String(50), nullable=False, index=True)
    flight_id = db.Column(db.String(100), nullable=False, unique=True)
    path_data = db.Column(db.Text, nullable=False)          # JSON: [[lon,lat,alt], ...]
    timestamps_data = db.Column(db.Text, nullable=False)    # JSON: [t0, t1, ...]
    start_offset = db.Column(db.Float, default=0.0)         # 起飞延迟偏移量
    dist_m = db.Column(db.Float, nullable=True)             # 飞行距离（米）
    duration_s = db.Column(db.Float, nullable=True)         # 飞行时长（秒）
    algo = db.Column(db.String(50), nullable=True)          # 算法标识
    batch_id = db.Column(db.String(36), nullable=True, index=True)  # 批次号，方便整批管理
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
