"""JSON-schema builders for structured LLM answers.

Ollama turns the schema into a grammar, so length and count bounds are enforced - and they cap output tokens.
"""
_STR = {"type": "string"}


def text(max_len):
    # Stops a small model that loops inside one string ("status": "... ... ...") from burning the whole token
    # budget and ending in invalid JSON. Generous, so normal answers are not cut.
    return {"type": "string", "maxLength": max_len}


def strs(max_items=None, min_items=0, max_len=None):
    return _bounded({"type": "array", "items": text(max_len) if max_len else _STR}, max_items, min_items)


def objs(max_items=None, min_items=0, **props):
    items = {"type": "object", "properties": props, "required": list(props)}
    return _bounded({"type": "array", "items": items}, max_items, min_items)


def _bounded(schema, max_items, min_items):
    if max_items:
        schema["maxItems"] = max_items
    if min_items:
        schema["minItems"] = min_items
    return schema
