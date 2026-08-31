# DecompileBridge.py — DSH ghidra 插件的常驻桥接服务器（Jython 2.7）
# 用法（headless）：
#   analyzeHeadless <projDir> <projName> -process <program> -noanalysis
#     -scriptPath <dir> -postScript DecompileBridge.py <portFile> <logFile>
# 协议：TCP 127.0.0.1 上的一行一个 JSON 请求/响应。
# ops: info | functions | decompile | strings | xrefs | ping | shutdown
# @category Analysis

import sys
import json

from java.io import BufferedReader, InputStreamReader, OutputStreamWriter, PrintWriter, FileWriter
from java.net import ServerSocket, InetAddress
from java.lang import String

from ghidra.app.decompiler import DecompInterface


def log(msg, logFile):
    if logFile:
        try:
            f = open(logFile, 'a')
            f.write(msg + '\n')
            f.close()
        except Exception:
            pass


def resolve_address(target):
    space = currentProgram.getAddressFactory().getDefaultAddressSpace()
    hexs = target[2:] if target.lower().startswith('0x') else target
    try:
        v = int(hexs, 16)
        return space.getAddress(v)
    except Exception:
        pass
    it = currentProgram.getSymbolTable().getSymbols(target)
    if it.hasNext():
        return it.next().getAddress()
    raise Exception('cannot resolve address/symbol: ' + target)


def op_info(obj):
    p = currentProgram
    blocks = []
    for b in p.getMemory().getBlocks():
        blocks.append({'name': str(b.getName()), 'start': str(b.getStart()), 'size': int(b.getSize())})
    eps = []
    it = p.getSymbolTable().getExternalEntryPointIterator()
    while it.hasNext():
        a = it.next()
        sym = p.getSymbolTable().getPrimarySymbol(a)
        eps.append({'name': str(sym.getName()) if sym is not None else '', 'address': str(a)})
    return {'program': str(p.getName()),
            'language': str(p.getLanguage().getLanguageID()),
            'compiler': str(p.getCompilerSpec().getCompilerSpecID()),
            'imageBase': str(p.getImageBase()),
            'minAddress': str(p.getMinAddress()),
            'maxAddress': str(p.getMaxAddress()),
            'functions': int(p.getFunctionManager().getFunctionCount()),
            'symbols': int(p.getSymbolTable().getNumSymbols()),
            'blocks': blocks,
            'entrypoints': eps}


def op_functions(obj):
    flt = obj.get('filter') or ''
    sort = obj.get('sort') or ''
    maxn = int(obj.get('max') or 200)
    rows = []
    it = currentProgram.getFunctionManager().getFunctions(True)
    while it.hasNext() and len(rows) < maxn:
        f = it.next()
        name = str(f.getName())
        if flt and flt not in name:
            continue
        rows.append({'name': name, 'address': str(f.getEntryPoint()),
                     'size': int(f.getBody().getNumAddresses()), 'thunk': bool(f.isThunk())})
    if sort == 'name':
        rows.sort(key=lambda r: r['name'].lower())
    return {'list': rows, 'total': len(rows)}


def op_decompile(obj):
    target = obj.get('target') or ''
    if not target:
        raise Exception('decompile: missing target')
    addr = resolve_address(target)
    fm = currentProgram.getFunctionManager()
    f = fm.getFunctionAt(addr)
    if f is None:
        f = fm.getFunctionContaining(addr)
    if f is None:
        raise Exception('decompile: no function at ' + target)
    di = DecompInterface()
    try:
        di.openProgram(currentProgram)
        res = di.decompileFunction(f, 60, monitor)
        if res is None or res.getDecompiledFunction() is None:
            raise Exception('decompile failed (program may need analysis): ' + str(f.getName()))
        code = res.getDecompiledFunction().getC()
        return {'function': str(f.getName()), 'address': str(f.getEntryPoint()),
                'signature': str(f.getSignature()), 'code': code}
    finally:
        di.dispose()


def op_strings(obj):
    flt = obj.get('filter') or ''
    minlen = int(obj.get('minLength') or 4)
    maxn = int(obj.get('max') or 200)
    rows = []
    it = currentProgram.getListing().getDefinedData(True)
    while it.hasNext() and len(rows) < maxn:
        d = it.next()
        dt = str(d.getDataType().getName()).lower()
        if 'string' not in dt and 'unicode' not in dt:
            continue
        v = d.getValue()
        if v is None:
            continue
        s = v if isinstance(v, str) else str(v)
        if len(s) < minlen:
            continue
        if flt and flt not in s:
            continue
        rows.append({'address': str(d.getAddress()), 'length': int(d.getLength()), 'value': s})
    return {'list': rows, 'total': len(rows)}


def op_xrefs(obj):
    target = obj.get('target') or ''
    direction = obj.get('direction') or 'to'
    maxn = int(obj.get('max') or 100)
    if not target:
        raise Exception('xrefs: missing target')
    addr = resolve_address(target)
    rm = currentProgram.getReferenceManager()
    # 注意：Ghidra 12 中 getReferencesFrom 返回数组，getReferencesTo 返回迭代器
    if direction == 'from':
        it = rm.getReferencesFrom(addr)
    else:
        it = rm.getReferencesTo(addr)
    refs = []
    if hasattr(it, 'hasNext'):
        while it.hasNext() and len(refs) < maxn:
            refs.append(it.next())
    else:
        refs = list(it)[:maxn]
    rows = []
    for r in refs:
        row = {'from': str(r.getFromAddress()), 'to': str(r.getToAddress()),
               'type': str(r.getReferenceType().getName())}
        sym = currentProgram.getSymbolTable().getSymbol(r)
        if sym is not None:
            row['symbol'] = str(sym.getName())
        rows.append(row)
    return {'address': str(addr), 'list': rows, 'total': len(rows)}


OPS = {
    'info': op_info,
    'functions': op_functions,
    'decompile': op_decompile,
    'strings': op_strings,
    'xrefs': op_xrefs,
    'ping': lambda obj: {'pong': True},
    'shutdown': lambda obj: {'bye': True},
}


def handle(line):
    try:
        obj = json.loads(line)
        op = obj.get('op')
        if op is None:
            return json.dumps({'ok': False, 'error': 'missing op'})
        handler = OPS.get(op)
        if handler is None:
            return json.dumps({'ok': False, 'error': 'unknown op: ' + str(op)})
        result = handler(obj)
        return json.dumps({'ok': True, 'result': result})
    except Exception as e:
        return json.dumps({'ok': False, 'error': str(e)})


def main():
    args = list(sys.argv)[1:]
    portFile = args[0] if len(args) > 0 else ''
    logFile = args[1] if len(args) > 1 else ''
    server = ServerSocket(0, 8, InetAddress.getLoopbackAddress())
    port = server.getLocalPort()
    if portFile:
        f = open(portFile, 'w')
        f.write(str(port))
        f.close()
    log('listening port=%d program=%s' % (port, currentProgram.getName()), logFile)
    while True:
        sock = None
        try:
            sock = server.accept()
            sock.setSoTimeout(120000)
            reader = BufferedReader(InputStreamReader(sock.getInputStream(), 'UTF-8'))
            writer = PrintWriter(OutputStreamWriter(sock.getOutputStream(), 'UTF-8'), True)
            line = reader.readLine()
            while line is not None:
                resp = handle(line)
                writer.println(resp)
                writer.flush()
                if '"shutdown"' in resp:
                    server.close()
                    log('shutdown', logFile)
                    return
                line = reader.readLine()
        except Exception as e:
            log('conn error: ' + str(e), logFile)
        finally:
            if sock is not None:
                try:
                    sock.close()
                except Exception:
                    pass


main()
