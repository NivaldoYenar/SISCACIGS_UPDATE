--
-- PostgreSQL database dump
--

\restrict ZooK1VaHJOSaO10kWBnlcM3VhkVBbPJKOgS3cX19JJwVP4TtmNEw2plticX6bGD

-- Dumped from database version 16.10 (Debian 16.10-1.pgdg13+1)
-- Dumped by pg_dump version 16.10 (Debian 16.10-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: army_rank; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.army_rank AS ENUM (
    'General de Exército',
    'General de Divisão',
    'General de Brigada',
    'Coronel',
    'Tenente-Coronel',
    'Major',
    'Capitão',
    '1º Tenente',
    '2º Tenente',
    'Aspirante a Oficial',
    'Cadete',
    'Subtenente',
    '1º Sargento',
    '2º Sargento',
    '3º Sargento',
    'Cabo',
    'Taifeiro-mor',
    'Taifeiro 1ª Classe',
    'Taifeiro 2ª Classe',
    'Soldado'
);


ALTER TYPE public.army_rank OWNER TO postgres;

--
-- Name: item_category; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.item_category AS ENUM (
    'GERAL',
    'OPTRONICO',
    'PARTICULAR',
    'FORA_DA_CARGA',
    'OUTRO'
);


ALTER TYPE public.item_category OWNER TO postgres;

--
-- Name: user_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role AS ENUM (
    'ADMIN',
    'USER',
    'ARMEIRO',
    'SCMT_OM',
    'CMT_SU_E_S2',
    'STI_OM'
);


ALTER TYPE public.user_role OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: current_possession; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.current_possession (
    item_id uuid NOT NULL,
    user_id uuid NOT NULL,
    kiosk_id uuid,
    since_timestamp timestamp with time zone NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    destination text,
    observation text,
    CONSTRAINT current_possession_destination_chk CHECK (((destination IS NULL) OR (destination = ANY (ARRAY['servico'::text, 'missao'::text, 'outro'::text]))))
);


ALTER TABLE public.current_possession OWNER TO postgres;

--
-- Name: face_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.face_templates (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    embedding double precision[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.face_templates OWNER TO postgres;

--
-- Name: item_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.item_types (
    id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category public.item_category DEFAULT 'GERAL'::public.item_category NOT NULL
);


ALTER TABLE public.item_types OWNER TO postgres;

--
-- Name: items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.items (
    id uuid NOT NULL,
    name text NOT NULL,
    serial_number text,
    description text,
    status text DEFAULT 'available'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    model text,
    brand text,
    disturbance text,
    asset_number text,
    active boolean NOT NULL DEFAULT true,
    item_type_id uuid
);


ALTER TABLE public.items OWNER TO postgres;

--
-- Name: kiosks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.kiosks (
    id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    secret_token text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.kiosks OWNER TO postgres;

--
-- Name: movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.movements (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    item_id uuid NOT NULL,
    kiosk_id uuid,
    action text NOT NULL,
    confidence numeric(4,3),
    requires_review boolean DEFAULT false NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    face_snapshot_b64 text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disturbance text,
    logged_user_id uuid
);


ALTER TABLE public.movements OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    profile_photo bytea,
    profile_photo_mime text,
    identity_number text,
    om text,
    role public.user_role DEFAULT 'USER'::public.user_role NOT NULL,
    password text,
    posto_graduacao public.army_rank DEFAULT 'Soldado'::public.army_rank NOT NULL,
    observation text
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: current_possession current_possession_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.current_possession
    ADD CONSTRAINT current_possession_pkey PRIMARY KEY (item_id);


--
-- Name: face_templates face_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_templates
    ADD CONSTRAINT face_templates_pkey PRIMARY KEY (id);


--
-- Name: item_types item_types_name_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_types
    ADD CONSTRAINT item_types_name_unique UNIQUE (name);


--
-- Name: item_types item_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.item_types
    ADD CONSTRAINT item_types_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: items items_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_unique UNIQUE (serial_number);


--
-- Name: kiosks kiosks_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kiosks
    ADD CONSTRAINT kiosks_code_key UNIQUE (code);


--
-- Name: kiosks kiosks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.kiosks
    ADD CONSTRAINT kiosks_pkey PRIMARY KEY (id);


--
-- Name: movements movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movements
    ADD CONSTRAINT movements_pkey PRIMARY KEY (id);


--
-- Name: users users_external_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_external_id_key UNIQUE (external_id);


--
-- Name: users users_identity_number_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_identity_number_unique UNIQUE (identity_number);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: face_templates_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX face_templates_user_idx ON public.face_templates USING btree (user_id);


--
-- Name: items_item_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX items_item_type_idx ON public.items USING btree (item_type_id);


--
-- Name: movements_captured_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX movements_captured_idx ON public.movements USING btree (captured_at);


--
-- Name: movements_item_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX movements_item_idx ON public.movements USING btree (item_id);


--
-- Name: movements_logged_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX movements_logged_user_idx ON public.movements USING btree (logged_user_id);


--
-- Name: movements_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX movements_user_idx ON public.movements USING btree (user_id);


--
-- Name: current_possession current_possession_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.current_possession
    ADD CONSTRAINT current_possession_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id);


--
-- Name: current_possession current_possession_kiosk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.current_possession
    ADD CONSTRAINT current_possession_kiosk_id_fkey FOREIGN KEY (kiosk_id) REFERENCES public.kiosks(id);


--
-- Name: current_possession current_possession_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.current_possession
    ADD CONSTRAINT current_possession_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: face_templates face_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.face_templates
    ADD CONSTRAINT face_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: items items_item_type_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_item_type_fk FOREIGN KEY (item_type_id) REFERENCES public.item_types(id);


--
-- Name: movements movements_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movements
    ADD CONSTRAINT movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id);


--
-- Name: movements movements_kiosk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movements
    ADD CONSTRAINT movements_kiosk_id_fkey FOREIGN KEY (kiosk_id) REFERENCES public.kiosks(id);


--
-- Name: movements movements_logged_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movements
    ADD CONSTRAINT movements_logged_user_id_fkey FOREIGN KEY (logged_user_id) REFERENCES public.users(id);


--
-- Name: movements movements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.movements
    ADD CONSTRAINT movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict ZooK1VaHJOSaO10kWBnlcM3VhkVBbPJKOgS3cX19JJwVP4TtmNEw2plticX6bGD

