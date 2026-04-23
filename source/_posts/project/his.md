---
title: his
date: 2021-12-18 15:44:32
tags:
  - his 
categories: his
description: his
---

his环境部署

组件包括：redis，nacos集群，mysql

his-base-env.yml:

```yaml
version: '1.0'
services:
  redis:
    image: redis:7
    container_name: redis
    command: redis-server --appendonly yes --requirepass '123456'
    restart: always
    volumes:
      - /Users/v_wuwei07/study_file/his/mydata/redis/data:/data
    ports:
      - 6379:6379
  mysql:
    image: mysql:1
    platform: linux/amd64
    container_name: mysql
    build:
      context: ./mysql-dockerfile
      dockerfile: dockerfile
    command:
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --lower-case-table-names=1
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: root
    ports:
      - 3306:3306
    volumes:
      - /Users/v_wuwei07/study_file/his/mydata/mysql/data:/var/lib/mysql
      - /Users/v_wuwei07/study_file/his/mydata/mysql/conf.d:/etc/mysql/conf.d
      - /Users/v_wuwei07/study_file/his/mydata/mysql/log:/var/log/mysql
      - /Users/v_wuwei07/study_file/his/mydata/mysql/init:/docker-entrypoint-initdb.d/
    networks:
      - nacos_net
  nacos1:
    image: nacos/nacos-server:v2.2.2
    container_name: nacos1
    hostname: nacos1
    restart: always
    ports:
      - 8841:8848
      - 9841:9848
    environment:
      - MODE=cluster
      - PREFER_HOST_MODE=hostname
      - NACOS_SERVERS=nacos1:8848,nacos2:8848,nacos3:8848
      - SPRING_DATASOURCE_PLATFORM=mysql
      - MYSQL_SERVICE_HOST=mysql
      - MYSQL_SERVICE_PORT=3306
      - MYSQL_SERVICE_DB_NAME=nacos
      - MYSQL_SERVICE_USER=root
      - MYSQL_SERVICE_PASSWORD=root
      - MYSQL_DB_PARAM="characterEncoding=utf8&connectTimeout=1000&socketTimeout=3000&autoReconnect=true&serverTimezone=Asia/Shanghai"
    volumes:
      - /Users/v_wuwei07/study_file/his/app/nacos-cluster/logs1:/home/nacos/logs
    networks:
      - nacos_net
    depends_on:
      - mysql
  nacos2:
    image: nacos/nacos-server:v2.2.2
    container_name: nacos2
    hostname: nacos2
    restart: always
    ports:
      - 8841:8848
      - 9841:9848
    environment:
      - MODE=cluster
      - PREFER_HOST_MODE=hostname
      - NACOS_SERVERS=nacos1:8848,nacos2:8848,nacos3:8848
      - SPRING_DATASOURCE_PLATFORM=mysql
      - MYSQL_SERVICE_HOST=mysql
      - MYSQL_SERVICE_PORT=3306
      - MYSQL_SERVICE_DB_NAME=nacos
      - MYSQL_SERVICE_USER=root
      - MYSQL_SERVICE_PASSWORD=root
      - MYSQL_DB_PARAM="characterEncoding=utf8&connectTimeout=1000&socketTimeout=3000&autoReconnect=true&serverTimezone=Asia/Shanghai"
    volumes:
      - /Users/v_wuwei07/study_file/his/app/nacos-cluster/logs2:/home/nacos/logs
    networks:
      - nacos_net
    depends_on:
      - mysql
  nacos3:
    image: nacos/nacos-server:v2.2.2
    container_name: nacos3
    hostname: nacos3
    restart: always
    ports:
      - 8841:8848
      - 9841:9848
    environment:
      - MODE=cluster
      - PREFER_HOST_MODE=hostname
      - NACOS_SERVERS=nacos1:8848,nacos2:8848,nacos3:8848
      - SPRING_DATASOURCE_PLATFORM=mysql
      - MYSQL_SERVICE_HOST=mysql
      - MYSQL_SERVICE_PORT=3306
      - MYSQL_SERVICE_DB_NAME=nacos
      - MYSQL_SERVICE_USER=root
      - MYSQL_SERVICE_PASSWORD=root
      - MYSQL_DB_PARAM="characterEncoding=utf8&connectTimeout=1000&socketTimeout=3000&autoReconnect=true&serverTimezone=Asia/Shanghai"
    volumes:
      - /Users/v_wuwei07/study_file/his/app/nacos-cluster/logs3:/home/nacos/logs
    networks:
      - nacos_net
    depends_on:
      - mysql
networks:
  nacos_net:
    driver: bridge
```

Mysql.cnf

```mysql
[client]
port=3306
socket = /var/run/mysqld/mysqld.sock
[mysql]
no-auto-rehash
auto-rehash
default-character-set=utf8mb4
[mysqld]
###basic settings
server-id = 2
pid-file    = /var/run/mysqld/mysqld.pid
socket        = /var/run/mysqld/mysqld.sock
datadir        = /var/lib/mysql
#log-error    = /var/lib/mysql/error.log
# By default we only accept connections from localhost
#bind-address    = 127.0.0.1
# Disabling symbolic-links is recommended to prevent assorted security risks
symbolic-links=0
character-set-server = utf8mb4
sql_mode="NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION"
default-storage-engine=INNODB
transaction_isolation = READ-COMMITTED
auto_increment_offset = 1
connect_timeout = 20
max_connections = 3500
wait_timeout=86400
interactive_timeout=86400
interactive_timeout = 7200
log_bin_trust_function_creators = 1
wait_timeout = 7200
sort_buffer_size = 32M
join_buffer_size = 128M
max_allowed_packet = 1024M
tmp_table_size = 2097152
explicit_defaults_for_timestamp = 1
read_buffer_size = 16M
read_rnd_buffer_size = 32M
query_cache_type = 1
query_cache_size = 2M
table_open_cache = 1500
table_definition_cache = 1000
thread_cache_size = 768
back_log = 3000
open_files_limit = 65536
skip-name-resolve
########log settings########
log-output=FILE
general_log = ON
general_log_file=/var/lib/mysql/general.log
slow_query_log = ON
slow_query_log_file=/var/lib/mysql/slowquery.log
long_query_time=10
#log-error=/var/lib/mysql/error.log
log_queries_not_using_indexes = OFF
log_throttle_queries_not_using_indexes = 0
#expire_logs_days = 120
min_examined_row_limit = 100
########innodb settings########
innodb_io_capacity = 4000
innodb_io_capacity_max = 8000
innodb_buffer_pool_size = 6144M
innodb_file_per_table = on
innodb_buffer_pool_instances = 20
innodb_buffer_pool_load_at_startup = 1
innodb_buffer_pool_dump_at_shutdown = 1
innodb_log_file_size = 300M
innodb_log_files_in_group = 2 
innodb_log_buffer_size = 16M
innodb_undo_logs = 128
#innodb_undo_tablespaces = 3
#innodb_undo_log_truncate = 1
#innodb_max_undo_log_size = 2G
innodb_flush_method = O_DIRECT
innodb_flush_neighbors = 1
innodb_purge_threads = 4
innodb_large_prefix = 1
innodb_thread_concurrency = 64
innodb_print_all_deadlocks = 1
innodb_strict_mode = 1
innodb_sort_buffer_size = 64M
innodb_flush_log_at_trx_commit=1
innodb_autoextend_increment=64
innodb_concurrency_tickets=5000
innodb_old_blocks_time=1000
innodb_open_files=65536
innodb_stats_on_metadata=0
innodb_file_per_table=1
innodb_checksum_algorithm=0
#innodb_data_file_path=ibdata1:60M;ibdata2:60M;autoextend:max:1G
innodb_data_file_path = ibdata1:12M:autoextend
#innodb_temp_data_file_path = ibtmp1:500M:autoextend:max:20G
#innodb_buffer_pool_dump_pct = 40
#innodb_page_cleaners = 4
#innodb_purge_rseg_truncate_frequency = 128
binlog_gtid_simple_recovery=1
#log_timestamps=system
##############
delayed_insert_limit = 100
delayed_insert_timeout = 300
delayed_queue_size = 1000
delay_key_write = ON
disconnect_on_expired_password = ON
div_precision_increment = 4
end_markers_in_json = OFF
eq_range_index_dive_limit = 10
innodb_adaptive_flushing = ON
innodb_adaptive_hash_index = ON
innodb_adaptive_max_sleep_delay = 150000
#innodb_additional_mem_pool_size = 2097152
innodb_autoextend_increment = 64
innodb_autoinc_lock_mode = 1

```

