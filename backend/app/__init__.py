# Sur ce poste, un antivirus/proxy intercepte le TLS avec un certificat racine
# présent dans le magasin Windows mais absent du bundle certifi de Python.
# truststore fait utiliser le magasin de l'OS à tout le code Python (httpx,
# urllib, supabase-py) — sans lui, aucun appel vers Supabase n'aboutit.
try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:  # environnement où le TLS fonctionne sans ça
    pass
