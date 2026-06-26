import ast
import re

src = open('files/deploy_server.py').read()
ast.parse(src)
print('outer ok')
m = re.search(r'new_code = """(.*?)"""', src, re.S)
ast.parse(m.group(1))
print('inner server code ok')
