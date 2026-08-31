from pathlib import Path

p=Path('h5p-viewer-frame.html')
s=p.read_text(encoding='utf-8')
if "embedType:'div'" in s:
    print('embedType div already applied')
    raise SystemExit(0)
old="""          frame:true,\n          copyright:true,\n          export:false,\n          icon:false,\n          fullScreen:true,\n          reportingIsEnabled:true\n        });\n        state.hidden=true;\n        send('ready',{mainLibrary:String(h5p.mainLibrary||'')});"""
new="""          embedType:'div',\n          frame:false,\n          copyright:false,\n          export:false,\n          icon:false,\n          fullScreen:false,\n          reportingIsEnabled:true\n        });\n        const contentRoot=player.querySelector('.h5p-content');\n        if(!contentRoot) throw new Error('El motor H5P inició, pero no creó el contenido interactivo.');\n        state.hidden=true;\n        send('ready',{mainLibrary:String(h5p.mainLibrary||''),rendered:true});"""
if old not in s:
    raise SystemExit('viewer option anchor not found')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('embedType div applied')
