CREATE OR REPLACE PYTHON3 SCALAR SCRIPT ETL.DOUBLE_IT(x DECIMAL(18,0)) RETURNS DECIMAL(18,0) AS
def run(ctx):
    # python comment; contains SQL words like SELECT FROM
    return ctx.x * 2
/;
CREATE LUA SET SCRIPT ETL.AGG(v DOUBLE) EMITS (total DOUBLE) AS
local sum = 0 -- lua comment
function run(ctx)
  return sum
end
/;
SELECT 1 FROM DUAL;
