import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutSkillTree } from '../src/skill-tree.js';
import { SKILLS } from '../src/engine.js';

test('skill tree ranks never wrap roots into apparent false parent chains', () => {
  const tree=layoutSkillTree(SKILLS,'abilities');
  const get=id=>tree.nodes.find(n=>n.id===id);
  assert.equal(get('unlockEmp').y,get('unlockMissiles').y);
  assert.equal(get('unlockEmp').y,get('unlockAirstrike').y);
  assert.ok(get('slot2').y>get('unlockEmp').y);
  assert.ok(get('slot3').y>get('slot2').y);
});
test('dependency routes never cross an unrelated skill node and represent only actual edges',()=>{
  for(const branch of ['cannon','tesla','rail','tower','abilities']){
    const tree=layoutSkillTree(SKILLS,branch);
    for(const edge of tree.edges){
      assert.ok(SKILLS[edge.child].parents.includes(edge.parent));
      for(let i=1;i<edge.points.length;i++){
        const [ax,ay]=edge.points[i-1],[bx,by]=edge.points[i];
        for(const n of tree.nodes){
          if(n.id===edge.parent||n.id===edge.child)continue;
          const left=n.x+.1,right=n.x+n.width-.1,top=n.y+.1,bottom=n.y+n.height-.1;
          const crosses=ax===bx ? ax>left&&ax<right&&Math.max(ay,by)>top&&Math.min(ay,by)<bottom : ay>top&&ay<bottom&&Math.max(ax,bx)>left&&Math.min(ax,bx)<right;
          assert.equal(crosses,false,`${branch}: ${edge.parent}->${edge.child} crosses ${n.id}`);
        }
      }
    }
  }
});
