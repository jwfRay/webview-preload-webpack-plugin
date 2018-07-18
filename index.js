var babel = require('babel-core');
var rf=require("fs");

function myplugs(options){  
    this.initjsarr=[];
    this.preloadarr=[];
    this.projectRoot=options.projectpath;
    this.scriptinitarr={};
}
function babelcode(url,self){
    try{
        let transform = babel.transform; 
        let file=rf.readFileSync(self.projectRoot+url,"utf-8");
        let data=transform(file, {
            presets: ['es2015']
        }).code;
        return data;
    }catch(err){
        return null;
    }
    
}
function getbid(self){
    var project=require(self.projectRoot+'/project');
    var bid=project.offline.bid;
    self.bid=bid;
} 
function gethtmlinfo(str,self){ 
    try{
        let url=self.projectRoot+ str;
        var badjsidreg=/(badjsId:){1}[\s]*[\'|\"]{1}[0-9]+[\'|\"]{1}/;
        var businamereg=/(busi_name:){1}[\s]*[\'|\"]{1}[a-zA-Z_]+[\'|\"]{1}/;
        var data=rf.readFileSync(url,"utf-8");
        var badjsidarr=data.match(badjsidreg);
        var businamearr=data.match(businamereg);
        var badjsstr=parseInt(badjsidarr[0].match(/[0-9]+/));
        var businamrstr=businamearr[0].match(/'{1}[a-zA-Z_]+'{1}/)[0].match(/[a-zA-Z_]+/)[0];
        return [badjsstr,businamrstr];
    }catch(err){
        return null;
    }
   
}
function getfeflowlib(self){
    let feflow=require(self.projectRoot+'/feflow.json').builderOptions;
    self.moduleName=feflow.moduleName;
    self.bizName=feflow.bizName;
    self.domain=feflow.domian || 'now.qq.com';
    self.libarr=[];
    feflow.externals.map(item=>{
        self.libarr.push(item.entry);
    });
}
function getpreload(url,item,self){
    let data=babelcode(url,self);
    if(data){
        let str='//'+self.domain+'/'+self.moduleName+'/'+self.bizName+'/'+item+'/preload.js?_bid='+self.bid;
        let cdnstr='//cdn/'+self.bizName+'/'+item+'/preload.js?_bid='+self.bid
        self.preloadarr.push({filepath:cdnstr,filedata:data});
        return [str];
    }else{
        return [];
    }
}
function getscripts(url,item,self){
    let data=babelcode(url,self);
    let scripts=[...self.libarr];
    if(data){
        let str='//'+self.domain+'/'+self.moduleName+'/'+self.bizName+'/'+item+'/init.js?_bid='+self.bid;
        let cdnstr='//cdn/'+self.bizName+'/'+item+'/init.js?_bid='+self.bid
        self.initjsarr.push({filepath:cdnstr,filedata:data});
        self.scriptinitarr[item]=str;
        return scripts;
    }else{
        return scripts;
    }
    console.log(scripts);
}
function objectlist(files,obj,self){
    files.map(item=>{
        obj[item]={};
        let arr= gethtmlinfo('/src/pages/'+item+'/index.html',self);
        if(arr){
             obj[item].badjsId=arr[0].toString();
             obj[item].AVReportBusiName=arr[1];
        }else{
            obj[item].badjsId="";
             obj[item].AVReportBusiName="";
        }
        obj[item].scripts=getscripts('/src/pages/'+item+'/init.js',item,self);
        obj[item].styles=[];
        obj[item].preprocess=getpreload('/src/pages/'+item+'/preload.js',item,self);
        
    });
    return obj;
}

function getconfig(files,asset,obj,self,str){
    let flag=true;
    for(let key in asset){
        if(flag){
            let bizName=key.match(/(cdn\/){1}[a-zA-Z-]*\//)[0].replace('cdn/','').replace('/','');
            self.bizName=bizName;
            flag=false;
        }
        
        for(let i=0,len=files.length;i<len;i++){
            if(key.indexOf('/img/')==-1){
                let str='/'+files[i]+'_';
                if(key.indexOf(str)!=-1){
                    let filename=key.replace('cdn',str);
                    if(key.indexOf('.js?')!=-1){
                        obj[files[i]].scripts.push(filename);
                    }else if(key.indexOf('.css')!=-1){
                        obj[files[i]].styles.push(filename);
                    }
                }
            }
        }
    }
    for(let i in self.scriptinitarr){
        obj[i].scripts.push(self.scriptinitarr[i]);
    }
    return obj;
}

function documentlist(asset,str,self,str){
    let obj={};
    obj.version=new Date().getTime();
    return new Promise((resolve,reject)=>{
        rf.readdir(self.projectRoot+'/src/pages',function(err,files){
            if(err){
                reject(err); 
            }
            obj=objectlist(files,obj,self,asset);
            obj=getconfig(files,asset,obj,self,str);
            resolve(obj);
        });
    });
}
function addasset(self,assets,obj){
    self.preloadarr.map(item=>{
        let str='//'+self.domain;
        assets[item.filepath.replace('//','')] = {
            source: function() {
                return item.filedata;
            },
            size: function() {
                return item.filedata.length;
            }
        }
    });
    self.initjsarr.map(item=>{
        assets[item.filepath.replace('//','')] = {
            source: function() {
                return item.filedata;
            },
            size: function() {
                return item.filedata.length;
            }
        }
    });
    assets['now_config.json'] = {
        source: function() {
            return JSON.stringify(obj);
        },
        size: function() {
            return JSON.stringify(obj).length;
        }
    }
    return assets;
}
myplugs.prototype.apply=function(compiler){
    var self=this;
    compiler.plugin('emit', function(compilation, callback) {
        getbid(self);
        getfeflowlib(self);
        let asset=compilation.assets;
        let str='//'+self.domain+'/'+self.moduleName;
        getfeflowlib(self);
        documentlist(asset,str,self,str).then((obj)=>{
            compilation.assets= addasset(self,asset,obj);
            callback();
        }).catch((err)=>{
            console.log(err);
            throw "file read fail";
        });
        
        
    });
}
module.exports=myplugs;