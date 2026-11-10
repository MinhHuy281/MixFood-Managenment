# File này chịu trách nhiệm đánh dấu gói cấu hình trung tâm (config) của dự án Django MixFood-Management.
# Hỗ trợ kết nối CSDL MySQL qua PyMySQL trên môi trường Serverless (Vercel, AWS Lambda) hoặc cục bộ.
try:
    import pymysql
    pymysql.install_as_MySQLdb()
except ImportError:
    pass

