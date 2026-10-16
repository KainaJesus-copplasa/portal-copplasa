#!/usr/bin/env python3
"""Publica no portal a versão nova de um relatório (.html), no lugar do arquivo atual.

Uso:
    python3 scripts/publicar_relatorio.py --arquivo relatorio.html --relatorio "Placement Analytics"

Entra no portal com o login do robô (variáveis de ambiente PORTAL_ROBO_EMAIL e
PORTAL_ROBO_SENHA), envia o arquivo para o bucket privado, aponta o relatório para
ele e apaga a versão anterior. O endereço e a chave pública do Supabase vêm do
config.js do site (ou de SUPABASE_URL e SUPABASE_ANON_KEY, se definidas).

Se qualquer passo falhar, o relatório continua com a versão anterior e o programa
termina com código 1 e uma mensagem começando com "ERRO:".
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

SITE_CONFIG = "https://placement-copplasa.github.io/config.js"
BUCKET = "relatorios"
TAMANHO_MINIMO = 20 * 1024
TAMANHO_MAXIMO = 50 * 1024 * 1024


class Falha(Exception):
    pass


def pedir(metodo, url, cabecalhos=None, corpo=None, timeout=180):
    req = urllib.request.Request(url, data=corpo, method=metodo, headers=cabecalhos or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except (urllib.error.URLError, TimeoutError) as e:
        raise Falha(f"sem conexão com {urllib.parse.urlsplit(url).netloc}: {e}")


def json_ou_texto(dados):
    try:
        return json.loads(dados.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return dados[:300].decode("utf-8", "replace")


def carregar_config():
    url = os.environ.get("SUPABASE_URL")
    chave = os.environ.get("SUPABASE_ANON_KEY")
    if url and chave:
        return url.rstrip("/"), chave
    status, dados = pedir("GET", SITE_CONFIG, timeout=30)
    if status != 200:
        raise Falha(f"não foi possível ler {SITE_CONFIG} (HTTP {status})")
    texto = dados.decode("utf-8")
    achou_url = re.search(r'supabaseUrl:\s*"([^"]+)"', texto)
    achou_chave = re.search(r'supabaseAnonKey:\s*"([^"]+)"', texto)
    if not achou_url or not achou_chave:
        raise Falha("config.js do site não tem supabaseUrl e supabaseAnonKey")
    return achou_url.group(1).rstrip("/"), achou_chave.group(1)


def ler_relatorio(caminho):
    try:
        with open(caminho, "rb") as f:
            conteudo = f.read()
    except OSError as e:
        raise Falha(f"não foi possível ler o arquivo {caminho}: {e}")
    inicio = conteudo[:8192].lower()
    if len(conteudo) < TAMANHO_MINIMO or (b"<html" not in inicio and b"<!doctype" not in inicio) or b"</html>" not in conteudo[-4096:].lower():
        raise Falha(f"{caminho} não parece um relatório completo ({len(conteudo)} bytes); nada foi alterado")
    if len(conteudo) > TAMANHO_MAXIMO:
        raise Falha(f"{caminho} passa do limite de 50 MB; nada foi alterado")
    return conteudo


def entrar(base, chave):
    email = os.environ.get("PORTAL_ROBO_EMAIL", "").strip()
    senha = os.environ.get("PORTAL_ROBO_SENHA", "")
    if not email or not senha:
        raise Falha("as variáveis PORTAL_ROBO_EMAIL e PORTAL_ROBO_SENHA não estão definidas neste ambiente")
    corpo = json.dumps({"email": email, "password": senha}).encode()
    status, dados = pedir("POST", f"{base}/auth/v1/token?grant_type=password",
                          {"apikey": chave, "Content-Type": "application/json"}, corpo, timeout=30)
    if status != 200:
        raise Falha(f"o login do robô foi recusado (HTTP {status}): confira o e-mail e a senha nas variáveis do ambiente")
    resposta = json_ou_texto(dados)
    token = resposta.get("access_token") if isinstance(resposta, dict) else None
    if not token:
        raise Falha("o Supabase não devolveu o acesso do robô")
    return {"apikey": chave, "Authorization": f"Bearer {token}"}


def achar_relatorio(base, auth, titulo):
    filtro = urllib.parse.quote(titulo, safe="")
    status, dados = pedir("GET", f"{base}/rest/v1/portal_relatorios?select=id,titulo,arquivo&titulo=eq.{filtro}", auth, timeout=30)
    if status != 200:
        raise Falha(f"não foi possível consultar os relatórios (HTTP {status}): {json_ou_texto(dados)}")
    lista = json_ou_texto(dados)
    if not lista:
        raise Falha(f'nenhum relatório com o título "{titulo}" no portal (o robô precisa estar registrado e o título igual ao do portal)')
    if len(lista) > 1:
        raise Falha(f'há {len(lista)} relatórios com o título "{titulo}"; deixe o título único no portal')
    return lista[0]


def apagar_arquivo(base, auth, nome):
    corpo = json.dumps({"prefixes": [nome]}).encode()
    status, dados = pedir("DELETE", f"{base}/storage/v1/object/{BUCKET}",
                          dict(auth, **{"Content-Type": "application/json"}), corpo, timeout=60)
    return status == 200, dados


def publicar(caminho, titulo):
    conteudo = ler_relatorio(caminho)
    base, chave = carregar_config()
    auth = entrar(base, chave)
    relatorio = achar_relatorio(base, auth, titulo)

    novo = f"{uuid.uuid4()}.html"
    status, dados = pedir("POST", f"{base}/storage/v1/object/{BUCKET}/{novo}",
                          dict(auth, **{"Content-Type": "text/html", "cache-control": "3600", "x-upsert": "false"}),
                          conteudo, timeout=300)
    if status != 200:
        raise Falha(f"o envio do arquivo foi recusado (HTTP {status}): {json_ou_texto(dados)}")

    corpo = json.dumps({"p_relatorio": relatorio["id"], "p_arquivo": novo, "p_tamanho": len(conteudo)}).encode()
    status, dados = pedir("POST", f"{base}/rest/v1/rpc/portal_robo_trocar_arquivo",
                          dict(auth, **{"Content-Type": "application/json"}), corpo, timeout=60)
    if status != 200:
        apagar_arquivo(base, auth, novo)  # não deixa sobra no bucket
        raise Falha(f"não foi possível trocar o arquivo do relatório (HTTP {status}): {json_ou_texto(dados)}")

    antigo = json_ou_texto(dados)
    aviso = ""
    if isinstance(antigo, str) and antigo and antigo != novo:
        ok, resposta = apagar_arquivo(base, auth, antigo)
        if not ok:
            aviso = f" (aviso: a versão anterior {antigo} não foi apagada do bucket)"
    mb = len(conteudo) / (1024 * 1024)
    return f'"{relatorio["titulo"]}" atualizado no portal ({mb:.1f} MB){aviso}'


def main():
    p = argparse.ArgumentParser(description="Publica a versão nova de um relatório no portal.")
    p.add_argument("--arquivo", required=True, help="caminho do .html com a versão nova")
    p.add_argument("--relatorio", required=True, help="título do relatório no portal")
    args = p.parse_args()
    try:
        print("OK: " + publicar(args.arquivo, args.relatorio))
    except Falha as e:
        print(f'ERRO: "{args.relatorio}": {e}', file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
