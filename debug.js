var fs = require('fs');
var html = fs.readFileSync('index.html', 'utf8');
var si = html.indexOf('<script>', 22000);
var realClose = html.lastIndexOf('</script>');
var js = html.slice(si+8, realClose);

var lines = js.split('\n');
// Check exact content of lines 1-20
for(var i=0;i<20;i++){
  var hexLine = '';
  for(var j=0;j<Math.min(lines[i].length,30);j++){
    hexLine += lines[i].charCodeAt(j).toString(16).padStart(2,'0')+' ';
  }
  console.log('Line '+(i+1)+':', JSON.stringify(lines[i].slice(0,80)));
}
