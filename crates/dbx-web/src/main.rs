//! dbx-web standalone binary — a thin wrapper over the library's
//! [`run_server`](dbx_web::run_server), which reads its configuration from
//! `DBX_*` environment variables.

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "dbx_web=info,tower_http=info".parse().unwrap()),
        )
        .init();

    let cfg = dbx_web::ServerConfig::from_env();
    dbx_web::run_server(cfg).await
}
