"""Retain immutable Trellis publications and their engine flows."""
import sqlalchemy as sa
from alembic import op

revision = "8c0f2d5b3e7a"
down_revision = "7b9e1c4a2d6f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "trellis_document_publications",
        sa.Column("flow_id", sa.Text(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("engine_flow_id", sa.Uuid(), nullable=False),
        sa.Column("request_bytes", sa.LargeBinary(), nullable=False),
        sa.Column("receipt", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("flow_id", "revision"),
        sa.UniqueConstraint("engine_flow_id"),
        sa.ForeignKeyConstraint(["engine_flow_id"], ["flow.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("revision > 0"),
    )
    if op.get_bind().dialect.name == "sqlite":
        for action in ("UPDATE", "DELETE"):
            op.execute(f"""CREATE TRIGGER trellis_publication_{action.lower()} BEFORE {action}
                ON trellis_document_publications BEGIN SELECT RAISE(ABORT, 'publication_immutable'); END""")
            op.execute(f"""CREATE TRIGGER trellis_published_flow_{action.lower()} BEFORE {action} ON flow
                WHEN EXISTS(SELECT 1 FROM trellis_document_publications WHERE engine_flow_id=OLD.id)
                BEGIN SELECT RAISE(ABORT, 'published_flow_immutable'); END""")
    else:
        op.execute("""CREATE FUNCTION trellis_publication_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'publication_immutable'; END; $$""")
        op.execute("""CREATE TRIGGER trellis_publication_immutable BEFORE UPDATE OR DELETE
            ON trellis_document_publications FOR EACH ROW EXECUTE FUNCTION trellis_publication_immutable()""")
        op.execute("""CREATE FUNCTION trellis_published_flow_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF EXISTS(SELECT 1 FROM trellis_document_publications WHERE engine_flow_id=OLD.id)
            THEN RAISE EXCEPTION 'published_flow_immutable'; END IF;
            IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$""")
        op.execute("""CREATE TRIGGER trellis_published_flow_immutable BEFORE UPDATE OR DELETE ON flow
            FOR EACH ROW EXECUTE FUNCTION trellis_published_flow_immutable()""")


def downgrade():
    if op.get_bind().dialect.name == "sqlite":
        for action in ("update", "delete"):
            op.execute(f"DROP TRIGGER trellis_published_flow_{action}")
            op.execute(f"DROP TRIGGER trellis_publication_{action}")
    else:
        op.execute("DROP TRIGGER trellis_published_flow_immutable ON flow")
        op.execute("DROP TRIGGER trellis_publication_immutable ON trellis_document_publications")
        op.execute("DROP FUNCTION trellis_published_flow_immutable()")
        op.execute("DROP FUNCTION trellis_publication_immutable()")
    op.drop_table("trellis_document_publications")
