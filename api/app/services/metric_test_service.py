import json
import httpx
from ..schemas.group import MetricScalingConfig


async def fetch_metric_value(cfg: MetricScalingConfig) -> dict:
    try:
        value, raw = await _fetch(cfg)
        return {"success": True, "value": value, "raw_response": raw}
    except Exception as e:
        return {"success": False, "error": str(e)}


async def _fetch(cfg: MetricScalingConfig) -> tuple[float, str]:
    timeout = httpx.Timeout(15.0)
    headers = {}
    _apply_auth(headers, cfg)

    async with httpx.AsyncClient(timeout=timeout) as client:
        if cfg.source_type == "prometheus":
            return await _fetch_prometheus(client, cfg, headers)
        elif cfg.source_type == "zabbix":
            return await _fetch_zabbix(client, cfg, headers)
        elif cfg.source_type == "elasticsearch":
            return await _fetch_elasticsearch(client, cfg, headers)
        elif cfg.source_type == "datadog":
            return await _fetch_datadog(client, cfg, headers)
        elif cfg.source_type == "nagios":
            return await _fetch_nagios(client, cfg, headers)
        else:
            return await _fetch_custom_http(client, cfg, headers)


def _apply_auth(headers: dict, cfg: MetricScalingConfig):
    if cfg.auth_type == "bearer" and cfg.auth_token_ref:
        headers["Authorization"] = f"Bearer {cfg.auth_token_ref}"
    elif cfg.auth_type == "api_key_header" and cfg.auth_token_ref:
        header_name = cfg.auth_header or "X-API-Key"
        headers[header_name] = cfg.auth_token_ref


async def _fetch_prometheus(client: httpx.AsyncClient, cfg: MetricScalingConfig, headers: dict) -> tuple[float, str]:
    url = f"{cfg.endpoint.rstrip('/')}/api/v1/query"
    resp = await client.get(url, params={"query": cfg.query}, headers=headers)
    resp.raise_for_status()
    raw = resp.text
    data = resp.json()
    if data.get("status") != "success":
        raise ValueError(f"Prometheus status: {data.get('status')}")
    results = data.get("data", {}).get("result", [])
    if not results:
        raise ValueError("Prometheus: empty result set")
    value_pair = results[0].get("value", [])
    if len(value_pair) < 2:
        raise ValueError("Prometheus: no value in result")
    return float(value_pair[1]), raw


async def _fetch_zabbix(client: httpx.AsyncClient, cfg: MetricScalingConfig, headers: dict) -> tuple[float, str]:
    body = {
        "jsonrpc": "2.0",
        "method": "item.get",
        "params": {"output": ["lastvalue"], "itemids": cfg.query, "sortfield": "itemid"},
        "id": 1,
    }
    if cfg.auth_token_ref:
        body["auth"] = cfg.auth_token_ref
    headers["Content-Type"] = "application/json-rpc"
    resp = await client.post(cfg.endpoint, json=body, headers=headers)
    resp.raise_for_status()
    raw = resp.text
    data = resp.json()
    results = data.get("result", [])
    if not results:
        raise ValueError("Zabbix: no items returned")
    return float(results[0]["lastvalue"]), raw


async def _fetch_elasticsearch(client: httpx.AsyncClient, cfg: MetricScalingConfig, headers: dict) -> tuple[float, str]:
    url = f"{cfg.endpoint.rstrip('/')}/_search"
    headers["Content-Type"] = "application/json"
    resp = await client.post(url, content=cfg.query, headers=headers)
    resp.raise_for_status()
    raw = resp.text
    value = _extract_json_path(resp.json(), cfg.value_path)
    return value, raw


async def _fetch_datadog(client: httpx.AsyncClient, cfg: MetricScalingConfig, headers: dict) -> tuple[float, str]:
    import time
    now = int(time.time())
    from_ts = now - (cfg.rule.evaluation_window_seconds or 60)
    url = f"{cfg.endpoint.rstrip('/')}/api/v1/query"
    resp = await client.get(url, params={"query": cfg.query, "from": from_ts, "to": now}, headers=headers)
    resp.raise_for_status()
    raw = resp.text
    data = resp.json()
    series = data.get("series", [])
    if not series or not series[0].get("pointlist"):
        raise ValueError("Datadog: empty series")
    points = series[0]["pointlist"]
    last_point = points[-1]
    if len(last_point) < 2:
        raise ValueError("Datadog: invalid point format")
    return float(last_point[1]), raw


async def _fetch_nagios(client: httpx.AsyncClient, cfg: MetricScalingConfig, headers: dict) -> tuple[float, str]:
    url = f"{cfg.endpoint.rstrip('/')}/state/{cfg.query}"
    resp = await client.get(url, headers=headers)
    resp.raise_for_status()
    raw = resp.text
    if cfg.value_path:
        value = _extract_json_path(resp.json(), cfg.value_path)
    else:
        value = float(raw.strip())
    return value, raw


async def _fetch_custom_http(client: httpx.AsyncClient, cfg: MetricScalingConfig, headers: dict) -> tuple[float, str]:
    url = cfg.endpoint
    if cfg.query and "?" not in url:
        url = url + "?" + cfg.query
    resp = await client.get(url, headers=headers)
    resp.raise_for_status()
    raw = resp.text
    if cfg.value_path:
        value = _extract_json_path(resp.json(), cfg.value_path)
    else:
        value = float(raw.strip())
    return value, raw


def _extract_json_path(data: dict, path: str) -> float:
    parts = path.split(".")
    current = data
    for part in parts:
        if isinstance(current, dict):
            if part not in current:
                raise ValueError(f"Path '{path}' not found at key '{part}'")
            current = current[part]
        elif isinstance(current, list):
            idx = int(part)
            current = current[idx]
        else:
            raise ValueError(f"Path '{path}': cannot traverse type {type(current).__name__} at '{part}'")
    return float(current)
