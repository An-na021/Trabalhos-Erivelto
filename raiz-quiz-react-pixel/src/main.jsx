import React from 'react';
import { createRoot } from 'react-dom/client';
import { binaryTree, generalTree } from './questions.js';
import Competition from './competition.jsx';
import './pixel-theme.css';

function Icon({ name = 'arrow', size = 20, ...props }) {
  const paths = {
    arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
    back: <><path d="M20 12H5m6-7-7 7 7 7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    branch: <><path d="M12 5v7m-7 6v-6h14v6" /><rect x="10" y="2" width="4" height="4" /><rect x="3" y="18" width="4" height="4" /><rect x="17" y="18" width="4" height="4" /></>,
    book: <><path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2Z" /></>,
    reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" shapeRendering="crispEdges" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

function Tree({ type = 'binary', decorative = false }) {
  const tree = type === 'general' ? generalTree : binaryTree;
  const coords = Object.fromEntries(tree.nodes.map(([id, x, y]) => [id, [x, y]]));
  return <svg className={`tree-svg ${decorative ? 'hero-tree' : ''}`} viewBox="0 0 540 280" role="img" aria-label={tree.label}>
    <title>{tree.label}</title>
    {tree.edges.map(([a,b]) => <path key={a+b} d={`M${coords[a][0]} ${coords[a][1]} V${(coords[a][1]+coords[b][1])/2} H${coords[b][0]} V${coords[b][1]}`} className={decorative && ['AB', 'BD'].includes(a+b) ? 'edge traced' : 'edge'} />)}
    {tree.nodes.map(([id,x,y]) => <g key={id} transform={`translate(${x} ${y})`}>
      <path d="M-16 -23H16V-19H23V19H16V23H-16V19H-23V-19H-16Z" className={`tree-node ${decorative && ['A','B','D'].includes(id) ? 'visited' : ''}`} />
      <text textAnchor="middle" dy="6" className={`node-label ${decorative && ['A','B','D'].includes(id) ? 'visited-label' : ''}`}>{id}</text>
      {decorative && ['A','B','D'].includes(id) && <g transform="translate(21 -20)"><rect x="-10" y="-10" width="20" height="20" className="order-circle" /><text textAnchor="middle" dy="3.5" className="order-label">{{A:1,B:2,D:3}[id]}</text></g>}
    </g>)}
  </svg>;
}

createRoot(document.getElementById('root')).render(<Competition Tree={Tree} Icon={Icon} />);
