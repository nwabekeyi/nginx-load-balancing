# Nginx Load Balancing with Express.js

A hands-on demonstration of using **Nginx as a reverse proxy and load balancer** in front of multiple Node.js/Express application servers.

This project demonstrates:

* Nginx reverse proxying
* Load balancing with `least_conn`
* Multiple Express application instances
* Passive failure detection
* `max_fails`
* `fail_timeout`
* Backup application servers
* Forwarded request headers
* Nginx configuration on Debian/Ubuntu
* Load testing with `wrk`
* Application-server failover

The goal is to understand what happens to a request from the client, through Nginx, to one of several application servers.

---

## Architecture

```text
                         Client
                           |
                           |
                           v
                    +-------------+
                    |    Nginx    |
                    |    :8080    |
                    +-------------+
                           |
                           |
                    least_conn
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
     +---------+      +---------+      +---------+
     | Express |      | Express |      | Express |
     | :3001   |      | :3002   |      | :3003   |
     +---------+      +---------+      +---------+
          |                |                |
          +----------------+----------------+
                           |
                    If all active
                    servers fail
                           |
                           v
                     +---------+
                     | Express |
                     | :3004   |
                     | BACKUP  |
                     +---------+
```

The application consists of **four Express processes**.

* `3001` — active server
* `3002` — active server
* `3003` — active server
* `3004` — backup server

Nginx normally sends traffic only to `3001`, `3002`, and `3003`.

Port `3004` is used only when the active servers are unavailable.

---

# 1. Requirements

This project is designed for **Debian-based Linux systems**, including:

* Debian
* Ubuntu
* Linux Mint
* Other Debian-based distributions

You need:

* Node.js
* npm
* Nginx
* curl
* wrk (optional, for load testing)
* Git

---

# 2. Install the Required Software

Update the package list:

```bash
sudo apt update
```

Install Nginx:

```bash
sudo apt install nginx
```

Verify Nginx:

```bash
nginx -v
```

Verify Node.js:

```bash
node --version
```

Verify npm:

```bash
npm --version
```

Verify Git:

```bash
git --version
```

For load testing, install `wrk`:

```bash
sudo apt install wrk
```

Verify:

```bash
wrk --version
```

---

# 3. Clone the Repository

Clone the project:

```bash
git clone https://github.com/nwabekeyi/nginx-load-balancing.git
```

Enter the project:

```bash
cd nginx-load-balancing
```

Install the Node.js dependencies:

```bash
npm install
```

The repository contains the Nginx configuration required for the project.

The structure is:

```text
nginx-load-balancing/
├── README.md
├── package.json
├── server.js
├── nginx/
│   └── load-balancing.conf
└── .gitignore
```

---

# 4. The Express Application

The project uses one Express application that can be started on different ports.

The port is provided through the command line.

For example:

```bash
node server.js 3001
```

starts the application on port `3001`.

```bash
node server.js 3002
```

starts another instance on port `3002`.

The same application code is therefore used by all four servers.

---

# 5. Start the Express Servers

Open four terminal windows.

### Terminal 1

```bash
node server.js 3001
```

### Terminal 2

```bash
node server.js 3002
```

### Terminal 3

```bash
node server.js 3003
```

### Terminal 4

```bash
node server.js 3004
```

You should see:

```text
Express server running on port 3001
```

and similarly for the other ports.

---

# 6. Test the Express Servers Directly

Before involving Nginx, test each Express server directly.

```bash
curl http://localhost:3001/
```

```bash
curl http://localhost:3002/
```

```bash
curl http://localhost:3003/
```

```bash
curl http://localhost:3004/
```

Each response should identify the port handling the request.

For example:

```json
{
  "message": "Hello from Express",
  "server": "Server running on port 3001",
  "pid": 12345
}
```

This confirms that all four application instances are running.

---

# 7. Nginx Configuration

The Nginx configuration is included in this repository:

```text
nginx/load-balancing.conf
```

The configuration looks like this:

```nginx
upstream backend {
    least_conn;

    server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3003 max_fails=3 fail_timeout=30s;

    server 127.0.0.1:3004 backup;
}

server {
    listen 8080;

    location / {
        proxy_pass http://backend;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

# 8. Understanding the Nginx Configuration

## `upstream backend`

```nginx
upstream backend {
    ...
}
```

This defines a group of backend servers.

The name `backend` is arbitrary.

For example, this would also be valid:

```nginx
upstream express_servers {
    ...
}
```

But if you change the upstream name, `proxy_pass` must use the same name.

For example:

```nginx
upstream express_servers {
    ...
}
```

must be used with:

```nginx
proxy_pass http://express_servers;
```

---

# 9. `least_conn`

The configuration uses:

```nginx
least_conn;
```

This tells Nginx to use the **least-connections load-balancing method**.

Instead of simply sending requests in a fixed rotation, Nginx considers the number of active connections on each server.

Conceptually:

```text
3001 → 5 active connections
3002 → 2 active connections
3003 → 8 active connections
```

A new connection can be sent toward:

```text
3002
```

because it currently has fewer active connections.

Without:

```nginx
least_conn;
```

Nginx uses **round robin** by default.

---

# 10. Active Servers

These are the normal application servers:

```nginx
server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
server 127.0.0.1:3002 max_fails=3 fail_timeout=30s;
server 127.0.0.1:3003 max_fails=3 fail_timeout=30s;
```

Nginx can send normal traffic to all three.

---

# 11. Passive Failure Detection

Each active server has:

```nginx
max_fails=3
fail_timeout=30s
```

For example:

```nginx
server 127.0.0.1:3001 max_fails=3 fail_timeout=30s;
```

This tells Nginx to use passive failure detection.

In simplified terms, Nginx observes failures while handling real traffic.

If a server reaches the configured failure threshold, Nginx can temporarily consider that server unavailable.

This is different from an active health-check system where Nginx continuously sends dedicated health-check requests.

---

# 12. Backup Server

The fourth server is:

```nginx
server 127.0.0.1:3004 backup;
```

The `backup` parameter is important.

It means `3004` does not normally receive traffic while the primary servers are available.

The intended behavior is:

```text
3001 ─┐
3002 ─┼── Normal traffic
3003 ─┘

3004 ─── Backup
```

If the active servers become unavailable, Nginx can start using:

```text
3004
```

This demonstrates basic application-server failover.

---

# 13. Nginx Server Block

The configuration contains:

```nginx
server {
    listen 8080;
```

This tells Nginx to listen for HTTP requests on port `8080`.

Therefore, the client accesses:

```text
http://localhost:8080
```

instead of directly accessing:

```text
http://localhost:3001
http://localhost:3002
http://localhost:3003
http://localhost:3004
```

---

# 14. Location Block

The configuration contains:

```nginx
location / {
```

This matches requests beginning at `/`.

For example:

```text
/
```

```text
/users
```

```text
/products
```

```text
/api/orders
```

would all fall under this location unless a more specific location exists.

---

# 15. Reverse Proxy

The most important line is:

```nginx
proxy_pass http://backend;
```

Remember that:

```nginx
upstream backend {
    ...
}
```

created the upstream group.

Therefore:

```nginx
proxy_pass http://backend;
```

means:

> Forward this request to one of the servers in the `backend` upstream group.

The request flow becomes:

```text
Client
   |
   | HTTP request
   v
Nginx :8080
   |
   | proxy_pass
   v
backend upstream
   |
   +----> 3001
   |
   +----> 3002
   |
   +----> 3003
   |
   +----> 3004 if backup is needed
```

---

# 16. Forwarded Headers

The configuration also contains:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

These headers provide the backend application with information about the original request.

### Host

```nginx
proxy_set_header Host $host;
```

Preserves the original host.

### X-Real-IP

```nginx
proxy_set_header X-Real-IP $remote_addr;
```

Passes the client's IP address as seen by Nginx.

### X-Forwarded-For

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Maintains the proxy chain of client IP addresses.

This is especially important when there are multiple proxies.

### X-Forwarded-Proto

```nginx
proxy_set_header X-Forwarded-Proto $scheme;
```

Tells the backend whether the original request used:

```text
http
```

or:

```text
https
```

---

# 17. Install the Project Nginx Configuration

The configuration inside the repository is **not automatically loaded by Nginx**.

You need to copy it into Nginx's configuration directory.

On Debian/Ubuntu:

```bash
sudo cp nginx/load-balancing.conf /etc/nginx/conf.d/load-balancing.conf
```

You can verify the copied file:

```bash
sudo cat /etc/nginx/conf.d/load-balancing.conf
```

You should see the same configuration that exists in:

```text
nginx/load-balancing.conf
```

---

# 18. Test the Nginx Configuration

Before reloading Nginx, always test the configuration:

```bash
sudo nginx -t
```

A successful result should look similar to:

```text
syntax is ok
test is successful
```

Only reload Nginx after the configuration test succeeds.

```bash
sudo systemctl reload nginx
```

Check the service:

```bash
sudo systemctl status nginx
```

---

# 19. Test Through Nginx

Now make a request to:

```bash
curl http://localhost:8080/
```

You are no longer communicating directly with an Express server.

The request path is now:

```text
curl
 |
 v
Nginx :8080
 |
 v
backend upstream
 |
 +--> 3001
 +--> 3002
 +--> 3003
```

Run multiple requests:

```bash
for i in {1..10}; do
    curl -s http://localhost:8080/
    echo
done
```

The response will show which Express process handled each request.

---

# 20. Test the Users Endpoint

The Express application also provides:

```text
/users
```

Test it through Nginx:

```bash
curl http://localhost:8080/users
```

Or repeatedly:

```bash
for i in {1..10}; do
    curl -s http://localhost:8080/users
    echo
done
```

---

# 21. Test Failover

One of the purposes of this project is to demonstrate what happens when application servers become unavailable.

First, make sure all four Express servers are running.

Then stop the processes running on:

```text
3001
3002
3003
```

You can terminate the relevant Node processes from their terminals using:

```text
Ctrl+C
```

Now only:

```text
3004
```

should be running.

Send a request:

```bash
curl http://localhost:8080/
```

Nginx should eventually route the request to the backup server.

The response should identify:

```text
Server running on port 3004
```

This demonstrates the backup-server configuration.

---

# 22. Restart the Primary Servers

Start the primary servers again:

```bash
node server.js 3001
```

```bash
node server.js 3002
```

```bash
node server.js 3003
```

Once the primary servers are available again, Nginx can return to using them normally.

---

# 23. Load Testing with wrk

`wrk` can be used to generate HTTP traffic against Nginx.

Basic test:

```bash
wrk -t1 -c25 -d30s http://localhost:8080/
```

You can increase concurrency:

```bash
wrk -t1 -c50 -d30s http://localhost:8080/
```

```bash
wrk -t1 -c100 -d30s http://localhost:8080/
```

```bash
wrk -t1 -c200 -d30s http://localhost:8080/
```

---

# 24. Understanding wrk Options

Example:

```bash
wrk -t1 -c100 -d30s http://localhost:8080/
```

### `-t1`

Uses one `wrk` worker thread.

This is the load generator's thread count.

It is **not** the number of CPU cores being used by Nginx.

### `-c100`

Creates 100 concurrent HTTP connections.

### `-d30s`

Runs the test for 30 seconds.

Therefore:

```text
wrk -t1 -c100 -d30s
```

means:

> Use one wrk thread, maintain up to 100 concurrent connections, and run the benchmark for 30 seconds.

---

# 25. What to Measure

When load testing, pay attention to:

```text
Requests/sec
Latency
Socket errors
Non-2xx responses
CPU usage
Memory usage
```

For example:

```text
Requests/sec: 3000
Latency:       8ms
```

is very different from:

```text
Requests/sec: 300
Latency:       400ms
```

A higher request rate does not automatically mean the system is performing well.

Latency and errors must also be considered.

---

# 26. Monitor the Linux Server

While running `wrk`, open another terminal.

Use:

```bash
htop
```

You can also use:

```bash
free -h
```

For CPU and memory statistics:

```bash
vmstat 1
```

This lets you observe what is happening on the machine while Nginx and the Express processes are under load.

---

# 27. Understanding the Complete Request Flow

The complete request flow in this project is:

```text
                     HTTP Request
                           |
                           v
                    +-------------+
                    |    Nginx    |
                    |    :8080    |
                    +-------------+
                           |
                           v
                    upstream backend
                           |
                     least_conn
                           |
             +-------------+-------------+
             |             |             |
             v             v             v
          :3001         :3002         :3003
             |             |             |
             +-------------+-------------+
                           |
                  If active servers
                     are unavailable
                           |
                           v
                         :3004
                       BACKUP
```

Nginx therefore acts as the entry point to the application.

The client does not need to know which Express server handled the request.

---

# 28. Why Use Multiple Application Servers?

Running multiple application instances can provide:

* Higher application-layer capacity
* Distribution of incoming connections
* Better fault isolation
* Application-server failover
* The ability to scale horizontally

Instead of having:

```text
Client
  |
  v
One Express process
```

you can have:

```text
Client
  |
  v
Nginx
  |
  +----> Express 1
  |
  +----> Express 2
  |
  +----> Express 3
```

If the application needs more capacity, additional application instances can potentially be introduced.

---

# 29. Important: Load Balancing Does Not Remove Bottlenecks

Adding application servers does not automatically make the entire system infinitely scalable.

For example:

```text
                  Nginx
                    |
          +---------+---------+
          |         |         |
         API       API       API
          |         |         |
          +---------+---------+
                    |
                  Redis
                    |
                 Database
```

The Express servers may be able to handle more traffic while the database cannot.

The database could therefore become the bottleneck.

The same applies to:

* Redis
* External APIs
* Payment providers
* Network bandwidth
* Storage
* CPU
* Memory
* Connection pools

Load balancing increases capacity at the layer being scaled; it does not eliminate bottlenecks elsewhere in the request path.

---

# 30. Application Servers Should Normally Be Private

In a production architecture, clients generally should not be able to bypass the load balancer and directly access the application servers.

Instead of:

```text
Internet
   |
   +----> Nginx
   |
   +----> Express :3001
   |
   +----> Express :3002
   |
   +----> Express :3003
```

the preferred architecture is:

```text
Internet
   |
   v
Nginx / Load Balancer
   |
   +----> Private App Server
   |
   +----> Private App Server
   |
   +----> Private App Server
   |
   +----> Private Backup Server
```

On a single machine, the Express applications can bind to localhost:

```javascript
app.listen(PORT, "127.0.0.1");
```

On separate machines, firewall/security-group rules can restrict application ports so that only the load balancer can reach them.

---

# 31. Nginx Configuration Location

This project stores the configuration in:

```text
nginx/load-balancing.conf
```

After installation, it is copied to:

```text
/etc/nginx/conf.d/load-balancing.conf
```

This distinction is important.

The Git repository contains the **source configuration**.

Nginx loads the **system configuration**.

Therefore, if you modify the repository configuration, you need to copy it again:

```bash
sudo cp nginx/load-balancing.conf /etc/nginx/conf.d/load-balancing.conf
```

Then test:

```bash
sudo nginx -t
```

Then reload:

```bash
sudo systemctl reload nginx
```

---

# 32. Useful Nginx Commands

Check Nginx version:

```bash
nginx -v
```

Test configuration:

```bash
sudo nginx -t
```

Display the complete loaded configuration:

```bash
sudo nginx -T
```

Reload Nginx:

```bash
sudo systemctl reload nginx
```

Restart Nginx:

```bash
sudo systemctl restart nginx
```

Check status:

```bash
sudo systemctl status nginx
```

Start Nginx:

```bash
sudo systemctl start nginx
```

Stop Nginx:

```bash
sudo systemctl stop nginx
```

---

# 33. Troubleshooting

## Nginx configuration test fails

Run:

```bash
sudo nginx -t
```

Read the error carefully.

You can also inspect the complete configuration:

```bash
sudo nginx -T
```

---

## Port 8080 is already in use

Check:

```bash
sudo lsof -i :8080
```

or:

```bash
sudo ss -ltnp | grep :8080
```

---

## Express server is not responding

Check whether the process is listening:

```bash
sudo ss -ltnp | grep :3001
```

Repeat for:

```text
3002
3003
3004
```

You can also test the server directly:

```bash
curl http://localhost:3001/
```

---

## Nginx cannot connect to the Express server

First test the Express server directly:

```bash
curl http://localhost:3001/
```

If this fails, the problem is probably with the Express process rather than Nginx.

If the direct request works, test through Nginx:

```bash
curl http://localhost:8080/
```

---

# 34. Project Learning Objectives

After completing this project, you should understand:

### Reverse proxying

How Nginx receives a request and forwards it to an application server.

### Upstream servers

How Nginx groups backend servers using:

```nginx
upstream backend {
    ...
}
```

### Load-balancing algorithms

How:

```nginx
least_conn;
```

affects server selection.

### Passive failure detection

How:

```nginx
max_fails
fail_timeout
```

affect backend availability.

### Backup servers

How:

```nginx
backup
```

can provide a failover server.

### Forwarded headers

How Nginx communicates original request information to backend applications.

### Horizontal scaling

How multiple application processes can operate behind one entry point.

### Load testing

How `wrk` can be used to measure request rate, latency, concurrency, and errors.

---

# 35. Final Architecture

The final setup looks like this:

```text
                        CLIENT
                           |
                           | HTTP :8080
                           v
                    +-------------+
                    |    NGINX    |
                    |  Reverse    |
                    |    Proxy    |
                    +-------------+
                           |
                           |
                     least_conn
                           |
            +--------------+--------------+
            |              |              |
            v              v              v
       +---------+    +---------+    +---------+
       | Express |    | Express |    | Express |
       |  :3001  |    |  :3002  |    |  :3003  |
       | ACTIVE  |    | ACTIVE  |    | ACTIVE  |
       +---------+    +---------+    +---------+
            |              |              |
            +--------------+--------------+
                           |
                    All active servers
                    unavailable
                           |
                           v
                     +---------+
                     | Express |
                     |  :3004  |
                     | BACKUP  |
                     +---------+
```

The key idea is:

```text
Client
  ↓
Nginx
  ↓
Load-balancing algorithm
  ↓
Application server
  ↓
Application response
  ↓
Nginx
  ↓
Client
```

This project provides a small local environment for understanding how that architecture works before deploying the same concepts across multiple production servers.
